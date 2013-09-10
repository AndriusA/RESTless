// Copyright (C) 2013 Andrius Aucinas, University of Cambridge
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// @author Andrius Aucinas

(function() {
  var BaconTracer;
  var Relationships;
  var counter = 0;
  var BaconMap = {};

  BaconMap[counter++] = {BaconID: counter, BaconName: "TOPLEVEL"};
  this.BaconTracer = BaconTracer = {}
  this.Relationships = Relationships = {}

  BaconTracer.proxyObject = function (target) {
    var BaconName = undefined;
    // A list of Bacon Observables that the current one takes data from
    var handler = new ForwardingHandler(target);
    var BaconID = counter++;
    var generator = undefined;
    
    handler.get = function(rcvr, name) {
      // A bunch of special properties
      if (name === "BaconName") {
        return BaconName;
      }
      if (name === "BaconID") {
        return BaconID;
      }
      if (name === "generator") {
        return generator;
      }
      // This check should in theory be done using Proxy.isTrapping();
      // Not even firefox implements it
      if (name === "isProxy") {
        return true;
      }

      if (typeof this.target[name] === "function") {
          if (this.target.isProxy) {
            console.error("The target is a proxy (" + name + "). The target's ID is " + this.target.ObservableID + ". Should never get here");
            // Returning null will most likely break execution;
            // otherwise risk runaway recursion
            return null;
          }
          // Need a function proxy to deal with function invocations
          return BaconTracer.proxyFunction(this.target[name], name);
      }

      return this.target[name];
    };

    handler.set =  function(rcvr,name,val) {
      if (name === "BaconName") {
          BaconName = val;
          return true;
      }
      if (name === "generator") {
        generator = val;
        return true;
      }
      // Not allowing to set BaconID or isProxy values from the outside
      this.target[name]=val;
      return true; 
    };

    try {
      // Don't wrap an object that's already a proxy...
      if (target.isProxy) {
        BaconMap[BaconID] = target;
        return target;
      }
      var proxy = Proxy.create(handler, Object.getPrototypeOf(target));
      BaconMap[BaconID] = proxy;
      return proxy;
    } catch (err) {
      console.error(err.stack);
      throw err;
    } 
  }

  BaconTracer.proxyFunction = function (target, targetName) {
    return Proxy.createFunction(
      new ForwardingHandler(target),
      function() { 
        var targetFunResult = undefined;
        targetFunResult = target.apply(this, arguments);

        // Check if we want to encapsulate the result
        if (BaconInstance(targetFunResult)) {
          var proxy = BaconTracer.proxyObject(targetFunResult);
          proxy.generator = targetName;

          // Special clause to deal with when EventStreams are created from HTML actions
          if (targetName === "asEventStream") {
            var elementBaconID = counter++;
            BaconMap[elementBaconID] = {BaconID: elementBaconID, BaconName: this.selector, generator: arguments[0]};
            addRelationship(proxy.BaconID, elementBaconID);
            addRelationship(elementBaconID, 0);
          }

          else if (targetName === "fromEventTarget") {
            var elementBaconID = counter++;
            BaconMap[elementBaconID] = {BaconID: elementBaconID, BaconName: this.selector, generator: arguments[0]};
            addRelationship(proxy.BaconID, elementBaconID);
            addRelationship(elementBaconID, 0);
          }

          // this.BaconID is the same as proxy.BaconID for valueOf method
          if (BaconInstance(this) && proxy.BaconID != this.BaconID)
            addRelationship(proxy.BaconID, this.BaconID);
          for (arg in arguments){
            var argument = arguments[arg];
            if (BaconInstance(argument))
              addRelationship(proxy.BaconID, argument.BaconID);
          }
          return proxy;
        }

        // if the passed object is Bacon.Bus and the result is not a Bacon type,
        // assume arguments go into the bus
        if (this instanceof Bacon.Bus) {
          for (arg in arguments){
            var argument = arguments[arg];
            if (BaconInstance(argument))
              addRelationship(this.BaconID, argument.BaconID);
          }
        }
        return targetFunResult;
      },
      // When a function is called as a constructor (i.e. with New) - different logic
      function() {
        var temp = function(){};
        var inst, ret;
        temp.prototype = target.prototype;
        inst = new temp;
        ret = target.apply(inst, arguments);
        var targetFunResult = Object(ret) === ret ? ret : inst;
        
        if (targetFunResult instanceof Bacon.Bus) {
          var proxy = BaconTracer.proxyObject(targetFunResult);
          return proxy;
        } 
        return targetFunResult;
      }
    );
  }

  function BaconInstance(obj) {
    return obj instanceof Bacon.EventStream 
      || obj instanceof Bacon.Property 
      || obj instanceof Bacon.Observable 
      || obj instanceof Bacon.Bus;
  }

  function addRelationship(target, source) {
    if (Relationships[source])
      Relationships[source].push(target)
    else 
      Relationships[source] = [target];
  }

  // Override "asEventStream" of jquery to trap when Bacon EventStreams are created for HTML interaction
  $.fn.asEventStream = BaconTracer.proxyFunction(Bacon.$.asEventStream, "asEventStream");


  // Generate graph of relationships between Bacon entities
  BaconTracer.getRelationshipsPairs = function(){
    links = [];
    nodes = {};
    for (i in Relationships) {
      for (j in Relationships[i]) {
        // FIXME: sometimes i is undefined... Not sure why
        try {
          links.push({
            target: BaconMap[i].BaconID, 
            source: Relationships[i][j]
          })
        } catch (err) {
          console.error(err.stack);
          console.error("error for node ", i, j);
        }

      }
    }
    links.forEach(function(link) {
      link.source = nodes[link.source] || (nodes[link.source] = {id: link.source, name: BaconMap[link.source].BaconName, generator: BaconMap[link.source].generator});
      link.target = nodes[link.target] || (nodes[link.target] = {id: link.target, name: BaconMap[link.target].BaconName, generator: BaconMap[link.target].generator});
    });
    return {nodes: nodes, links: links};
  }

  BaconTracer.drawRelationshipsForce = function(elementID) {
    var htmlElement = $(elementID);
    // Chart dimensions.
    var margin = {top: 30, right: 80, bottom: 30, left: 30},
        width = htmlElement.width() - margin.right - margin.left,
        height = htmlElement.height() - margin.top - margin.bottom;
    var svg = d3.select(elementID).append("svg");

    var data = BaconTracer.getRelationshipsPairs();
    var force = d3.layout.force()
        .nodes(d3.values(data.nodes))
        .links(data.links)
        .size([width, height])
        .linkDistance(100)
        .charge(-600)
        .gravity(0.05)
        .theta(0.1);

    var area = svg.append("g")
        .attr("transform", "translate(" + (margin.left) + "," + margin.top + ")")
        .attr("width", width)
        .attr("height", height);

    var defs = area.append("svg:defs")
    var pathArea = area.append("svg:g")
    var nodesArea = area.append("g")
    var textArea = area.append("g")
    
    var path, circle, text;

    function restart(links, nodes) {
        force.links(links);
        force.nodes(d3.values(nodes));
        force.on("tick", tick)

        var rootNode = force.nodes()[0];
        
        var markers = defs.selectAll("marker")
            .data(_.map(force.links(), function(d){ return d.target.id+"-"+d.source.id}), function(d){ return d;});

        markers.enter().append("marker")
                .attr("class", "linkMarker")
                .attr("id", String)
                .attr("viewBox", "0 -5 10 10")
                .attr("refX", 16)
                .attr("refY", -1.5)
                .attr("markerWidth", 6)
                .attr("markerHeight", 6)
                .attr("orient", "auto")
            .append("svg:path")
                .attr("d", "M0,-5L10,0L0,5");
        markers.exit().remove();

        path = pathArea.selectAll("path")
                .data(force.links(), function(d){ return d.target.id+"-"+d.source.id;})

        path.enter().append("svg:path")
                .attr("class", "link")
                .attr("marker-end", function(d) { return "url(#" + d.target.id +"-"+d.source.id + ")"; })

        path.exit().remove()


        circle = nodesArea.selectAll("circle")
                .data(force.nodes(), function(d) { return d.id })

        circle.enter().append("circle")
                .attr("class", function(d) { if (d.name && d.name.length > 0) return "namedNode"; else return "unnamedNode"; })
                .attr("r", 6)
                .call(force.drag);

        circle.exit().remove();

        text = textArea.selectAll("g")
                .data(force.nodes())
        
        var svgText = text.enter().append("g");
        text.exit().remove();

        svgText.append("svg:text")
            .attr("text-anchor", "middle")
            .attr("x", 10)
            .attr("y", 20)
            .text(function(d) { return d.name || "" });
        svgText.append("svg:text")
            .attr("class", "generatorLabel")
            .attr("text-anchor", "middle")
            .attr("x", 0)
            .attr("y", -10)
            .text(function(d) { return d.generator || "" });

        force.start();

        // Use elliptical arc path segments to doubly-encode directionality.
        function tick() {
            var nodes = force.nodes();
            for (i in nodes) {
              if ((!Relationships[nodes[i].id] || Relationships[nodes[i].id].length === 0))
                nodes[i].x = width-margin.right;
            }
            rootNode.x = 0;
            rootNode.y = height/2;
            for (i in force.nodes())
            path.attr("d", function(d) {
                var dx = d.source.x - d.target.x,
                // Can also use curvature... choosing to use none
                dy = 0,//d.source.y - d.target.y,
                dr = 0;//Math.sqrt(dx * dx + dy * dy);
                return "M" + d.target.x + "," + d.target.y + "A" + dr + "," + dr + " 0 0,1 " + d.source.x + "," + d.source.y;
            });

            circle.attr("transform", function(d) {
                return "translate(" + d.x + "," + d.y + ")";
            });

            text.attr("transform", function(d) {
                return "translate(" + d.x + "," + d.y + ")";
            });
        }
    }

    restart(links, nodes); 
  }

}).call(this);


// A no-op forwarding Proxy Handleras proposed by Tom Van Cutsem

// Copyright (C) 2010 Software Languages Lab, Vrije Universiteit Brussel
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// A no-op forwarding Proxy Handler
// @author Tom Van Cutsem

function ForwardingHandler(target) {
  this.target = target;
}

ForwardingHandler.prototype = {
  // Object.getOwnPropertyDescriptor(proxy, name) -> pd | undefined
  getOwnPropertyDescriptor: function(name) {
    var desc = Object.getOwnPropertyDescriptor(this.target);
    desc.configurable = true;
    return desc;
  },

  // Object.getOwnPropertyNames(proxy) -> [ string ]
  getOwnPropertyNames: function() {
    return Object.getOwnPropertyNames(this.target);
  },
  
  // Object.defineProperty(proxy, name, pd) -> undefined
  defineProperty: function(name, desc) {
    return Object.defineProperty(this.target, name, desc);
  },

  // delete proxy[name] -> boolean
  'delete': function(name) { return delete this.target[name]; },

  // Object.{freeze|seal|preventExtensions}(proxy) -> proxy
  fix: function() {
    // As long as target is not frozen, the proxy won't allow itself to be fixed
    // if (!Object.isFrozen(this.target)) // FIXME: not yet implemented
    //     return undefined;
    // return Object.getOwnProperties(this.target); // FIXME: not yet implemented
    var props = {};
    for (var name in this.target) {
        props[x] = Object.getOwnPropertyDescriptor(this.target, name);
    }
    return props;
  },

  // name in proxy -> boolean
  has: function(name) { return name in this.target; },

  // ({}).hasOwnProperty.call(proxy, name) -> boolean
  hasOwn: function(name) { return ({}).hasOwnProperty.call(this.target, name); },

  // proxy[name] -> any
  get: function(receiver, name) { return this.target[name]; },

  // proxy[name] = val -> val
  set: function(receiver, name, val) {
    this.target[name] = val;
    // bad behavior when set fails in non-strict mode
    return true;
  },

  // for (var name in Object.create(proxy)) { ... }
  enumerate: function() {
    var result = [];
    for (name in this.target) { result.push(name); };
    return result;
  },
  
  // for (var name in proxy) { ... }
  iterate: function() {
    var props = this.enumerate();
    var i = 0;
    return {
      next: function() {
        if (i === props.length) throw StopIteration;
        return props[i++];
      }
    };
  },

  // Object.keys(proxy) -> [ string ]
  enumerateOwn: function() { return Object.keys(this.target); },
  keys: function() { return Object.keys(this.target); }
};

Proxy.wrap = function(obj) {
  var handler = new ForwardingHandler(obj);
  if (typeof obj === "object") {
    return Proxy.create(handler, Object.getPrototypeOf(obj));
  } else if (typeof obj === "function") {
    return Proxy.createFunction(handler, obj);
  } else {
    throw "Can only wrap objects or functions, given: "+(typeof obj);
  }
}
