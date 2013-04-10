#!/usr/bin/env ruby

require 'bundler/setup'
require 'sinatra'
require 'sinatra/config_file'
require 'haml'
require 'auger'
require 'json'

configure do
  set :auger_cfg, 'cfg'       #default values
  config_file 'config.yml'    #overwrite from config file if it exists

  set :path, settings.auger_cfg.split(File::PATH_SEPARATOR)
end

def list_files
  settings.path.map do |dir|
    Dir["#{dir}/*.rb"]
  end.flatten
end

def load_projects
  list_files.inject({}) do |hash, file|
    project = Auger::Config.load(file).projects.first
    id = File.basename(file).sub(/\.\w+$/, "")
    hash[id] = project
    hash
  end
end

def find_file(name)
  settings.path.map do |dir|
    File.join(dir, "#{name}.rb")
  end.find do |file|
    File.exists?(file)
  end
end

def load_project(name)
  Auger::Config.load(find_file(name)).projects.first
end

class Auger::Project
  def to_hash
    {
      :name    => @name,
      :servers => self.servers.map(&:name),
      ## FIXME
      # :roles   => self.roles.map do |name, servers|
      #   { :name => name, :servers => servers.map(&:name) }
      # end,
      :roles => [ "foo", "bar" ],
      :tests   => self.tests.map(&:name),
    }
  end
end

def format_outcome(outcome)
  case outcome
  when TrueClass then
    "\u2713"
  when MatchData then # boolean if no captures, otherwise list captures
    outcome.captures.empty? ? "\u2713" : outcome.captures.join(' ')
  when FalseClass then
    "\u2717"
  when NilClass then
    "nil"
  when Exception then
    "#{outcome.class}: #{outcome.to_s}"
  else
    outcome
  end
end

module Auger
  class Result
    def format
      id = self.test.id
      outcome =
        case self.outcome
        when TrueClass  then "\u2713"
        when MatchData  then @outcome.captures.empty? ? "\u2713" : @outcome.captures.join(' ')
        when FalseClass then "\u2717"
        when NilClass   then "nil"
        when Exception  then "#{@outcome.class}: #{@outcome.to_s}"
        else                 @outcome.to_s
        end
      status =
        case self.status
        when FalseClass, NilClass then :error
        when Exception            then :exception
        when Status               then self.status.value
        else                           :ok
        end
      [id, outcome, status]
    end
  end
end


def run_tests(project)
  tests = project.tests                           # list of all tests for project
  tests.each_with_index { |test, i| test.id = i } # give tests unique ids

  threads = {}
  project.servers.each do |server|
    threads[server.name] = []
    project.connections(*server.roles).each do |connection|
      threads[server.name] << Thread.new do
        conn = connection.try_open(server)
        connection.requests.map do |request|
          response, time = request.try_run(conn)
          request.tests.map do |test|
            test.run(response).format << time # return 4-element array
          end
        end.flatten(1)
        #connection.try_close(conn) ## FIXME
      end
    end
  end

  results = Hash.new { |hash, key| hash[key] = [] } #test results keyed by servername

  ## get test results indexed server and test id
  threads.map do |server, server_threads|
    server_threads.map do |thread|
      thread.value.each do |id, *result| # value waits on thread
        results[server][id] = result
      end
    end
  end

  return {
    :project => project.name,
    :tests   => tests.map(&:name),
    :servers => project.servers.map do |server|
      r = results[server.name]
      {
        :name    => server.name,
        :results => tests.map { |test| r.fetch(test.id, nil) }
      }
    end
  }

end

get '/projects/:id/tests' do
  JSON(projects[params[:id]].tests.map { |test| test.name })
end

get '/projects/:id' do
  JSON(load_project(params[:id]).to_hash)
end

get '/projects' do
  projects = load_projects.sort_by do |k,v|
    v.name
  end.map do |id, project|
    { :id => id, :name => project.name }
  end
  JSON(projects)
end

get '/run/:id' do
  project = load_project(params[:id])
  JSON(run_tests(project))
end

get '/:id' do
  @project = params[:id]
  haml :project
end

get '/' do
  @projects = load_projects.sort_by do |id, project|
    project.name
  end
  haml :index
end
