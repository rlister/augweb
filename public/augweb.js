var augweb = {
  project_id: null,
  data: {},

  project: function(id) {
    this.project_id = id;
    return this;
  },

  bind_keys: function() {
    var self = this;
    d3.select(window).on("keydown", function() {
      // console.log(d3.event.keyCode);
      if ( d3.event.metaKey || d3.event.ctrlKey ) {
        return;                 // skip on modifier keys
      }

      switch ( d3.event.keyCode ) {
      case 68:                  // d key
        self.incr_display_type(1);
        break;
      case 72:                  // h key
        window.location = "/";  // load homepage
        break;
      case 82:                  // r key
        self.run();             // re-run test
        break;
      case 191:                 // ? or / key
        alert(
          "d: change display type\n" +
          "h: homepage\n" +
          "r: re-run test\n" +
          "?: show keys"
        );
        break;
      default:
        return;
      }
    });

    return this;
  },

  // increment display to show
  incr_display_type: function(incr) {
    var element = d3.select("#displays"), // html select element
        length  = element.property("children").length, // number of option elements
        index   = (incr + element.property("selectedIndex")) % length, // incr selected index
        func    = element.property("selectedIndex", index).property("value"); // get function to call

    this[func](this.data);
    return this;
  },

  // run auger test
  run: function() {
    d3.select('.project').html('testing ...'); // super-lo-tech throbber

    var self = this;
    d3.json('/run/' + this.project_id, function(json) {
      self.data = json;                            // save data
      d3.select('.project').html(json['project']); // set project name
      var display_method = d3.select('#displays').property('value');
      self[display_method](json);
    });

    return this;
  },

  tabulate_by_server: function(data) {
    this.tabulate(data);
  },

  tabulate_by_test: function(data) {
    this.tabulate(this.transpose(data));
  },

  timing_by_server: function(data) {
    this.timing(this.transpose(data));
  },

  timing_by_test: function(data) {
    this.timing(data);
  },

  // transpose server and tests arrays
  transpose: function(data) {
    return{
      tests: data.servers.map(function(server) { return server.name }),
      servers: data.tests.map(function(test, i) {
        return {
          name: test,
          results: data.servers.map(function(server) {
            return server.results[i];
          })
        }
      })
    }
  },

  // draw html table
  tabulate: function(data) {
    var headers = [ "" ]
      .concat(data.tests)
      .map(function(header) {
        return [ header, "column-header" ];
      });

    var servers = data.servers.map(function(server) {
      return [ [ server.name, "row-header" ] ].concat(server.results);
    });

    var table = d3.select("#results")
      .html(null)
      .append("table");

    var tbody = table.append("tbody");

    servers = [headers].concat(servers);

    // create a row for each object in the data
    var rows = tbody.selectAll("tr")
      .data(servers)
      .enter()
      .append("tr");

    // create a cell in each row for each column
    var cells = rows.selectAll("td")
      .data(function(row) {
        return headers.map(function(column, i) {
          return row[i];
        });
      })
      .enter()
      .append("td")
      .text(function(d) { return d == null ? "––" : d[0] })
      .attr("class", function(d) { return d == null ? "na" : d[1] });

    return table;
  },

  // draw timing bar chart
  timing: function(data) {
    var num_elements = data.tests.length * data.servers.length,
        min_height = 400,
        margin = { top: 30, right: 20, bottom: 30, left: 40 },
        width = 1400 - margin.left - margin.right,
        height = d3.max([min_height, num_elements * 18]),// - margin.top - margin.bottom,
        yaxis_padding = width/4;

    var svg = d3.select("#results")
      .html(null)
      .append("svg")
      .attr("width",  width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var max_time = d3.max(data.servers, function(server) { return d3.max(server.results, function(result) { return result === null ? 0 : result[2] }) });

    var x = d3.scale.linear()
      .domain([0, max_time])
      .rangeRound([0, width/2]);

    var y0 = d3.scale.ordinal()
      .domain(data.servers.map(function(server) { return server.name }))
      .rangeRoundBands([0, height], .1);

    var y1 = d3.scale.ordinal()
      .domain(data.tests)
      .rangeRoundBands([0, y0.rangeBand()], .1);

    var xaxis = d3.svg.axis()
      .scale(x)
      .orient("top");

    svg.append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(" + yaxis_padding + ")")
      .call(xaxis);

    var y0axis = d3.svg.axis()
      .scale(y0)
      .orient("right");

    svg.append("g")
      .attr("class", "y0 axis")
      .attr("transform", "translate(" + 3*yaxis_padding + ")")
      .call(y0axis);

    var groups = svg.selectAll(".group")
      .data(data.servers)
      .enter()
      .append("g")
      .attr("class", "server")
      .attr("transform", function(d, i) { return "translate(" + yaxis_padding + "," + y0(d.name) + ")"; });

    groups.selectAll("rect")
      .data(function(d) { return d.results })
      .enter()
      .append("rect")
      .attr("height", y1.rangeBand())
      .attr("x", function(d) { return 0 })
      .attr("y", function(d, i) { return y1(data.tests[i]) })
      .attr("class", function(d, i) {
        var status = (d === null ? "na" : d[1]); // class to color based on result status
        return status + " " + "test" + i;        // add class for this test type
      })
      .on("mouseover", function(d, i){ groups.selectAll(".test" + i).classed("highlight", true)  }) // highlight all tests like this
      .on("mouseout",  function(d, i){ groups.selectAll(".test" + i).classed("highlight", false) })
      .transition()
      .attr("width", function(d) { return x(d === null ? 0 : d[2]) });

    // text labels inside bars
    groups.selectAll('text')
      .data(function(d) { return d.results })
      .enter()
      .append("text")
      .text(function(d) { return d === null ? '––' : d[0] })
      .attr("x", "0.5em")
      .attr("y", function(d, i) { return y1(data.tests[i]) + y1.rangeBand()*.8 })
      .attr("text-anchor", "right");

    var y1axis = d3.svg.axis()
      .scale(y1)
      .orient("left");

    // y1axes with test names
    groups.append("g")
      .attr("class", "y1 axis")
      .attr("transform", "translate(0, 0)")
      .call(y1axis);

    // rules
    var rules = svg.selectAll(".rule")
      .data(x.ticks(4))
      .enter()
      .append("g")
      .attr("class", "rule")
      .attr("transform", function(d) { return "translate(" + x(d) + ", 0)"; });

    rules.append("svg:line")
      .attr("y1", 0)
      .attr("y2", height)
      .attr("x1", yaxis_padding)
      .attr("x2", yaxis_padding);
  }
}
