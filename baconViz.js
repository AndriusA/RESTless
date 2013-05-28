(function() {
  var scale, time, tn;

  tn = new Date().valueOf();

  scale = d3.scale.linear().range([0, 600]).domain([tn - 10000, tn]);

  time = Bacon.fromPoll(1000 / 30, function() {
    return new Bacon.Next(new Date().valueOf());
  });
  time.map(function(t) {
    return [t - 10000, t];
  }).assign(function(ds) {
    return scale.domain(ds);
  });

  window.drawStream = function(container, title, stream) {
    var circles, drawCircles, svg;
    svg = d3.select(container).append('svg');
    svg.append('text').text(title).attr({
      x: 5,
      y: 20
    }).attr('class', 'title');
    svg.append('svg:line').attr({
      x1: 0,
      x2: 600,
      y1: 40.5,
      y2: 40.5
    });
    circles = [];
    stream = stream.map(function(p) {
      if (p.color) {
        console.log('c', p.color)
        return {
          v: p.v,
          color: p.color,
          time: new Date().valueOf()
        }
      } else {
        return {
          v: p,
          time: new Date().valueOf(),
          color: 'black'
        }
      }
    });
    stream.assign(function(c) {
      setTimeout(function() {
        circles.shift()
      },10000);
      return circles.push(c);
    });
    drawCircles = function() {
      var sel, tsel;
      sel = svg.selectAll('circle').data(circles, function(d) {
        return d.time;
      });
      sel.enter().append('circle').attr({
        cy: 40,
        r: 6,
        cx: 20
      }).style('fill', function(d) {
        return d.color;
      });

      sel.attr('cx', function(d) {
        return scale(d.time);
      })
      sel.exit().remove();
      tsel = svg.selectAll('text.p').data(circles, function(d) {
        return d.time;
      });
      tsel.enter().append('text').attr('class', 'p').text(function(d) {
        return d.v;
      }).attr('y', 70).attr('text-anchor', 'middle');
      tsel.attr('x', function(d) {
        return scale(d.time);
      });
      return tsel.exit().remove();
    };
    return time.assign(drawCircles);
  };

}).call(this);
