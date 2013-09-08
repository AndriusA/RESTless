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

  this.BaconTracer = BaconTracer = {}
  this.Relationships = Relationships = {}

  BaconTracer.proxyObject = function (target) {
    var BaconName = undefined;
    // A list of Bacon Observables that the current one takes data from
    var BaconInputs = [];
    var handler = new ForwardingHandler(target);
    var BaconID = counter++;
    
    handler.get = function(rcvr, name) {
      if (name === "BaconName") {
        return BaconName;
      }
      if (name === "BaconInputs") {
        if (BaconInputs.length > 0) {
          console.log("BaconInputs: ");
          for (i in BaconInputs)
            console.log(BaconMap[BaconInputs[i]].BaconName)
        }
        return BaconInputs;
      }
      if (name === "BaconID") {
        return BaconID;
      }

      if (typeof this.target[name] === "function") {
          return BaconTracer.proxyFunction(this.target[name], this.target);
      }

      return this.target[name];
    };

    handler.set =  function(rcvr,name,val) {
      if (name === "BaconName") {
          BaconName = val;
          console.debug("Setting name "+val+" for observable ID", BaconID);
          return true;
      }
      if (name === "BaconInputs") {
        BaconInputs = val;
        return true;
      }
      this.target[name]=val;
      return true; 
    };

    try {
      var proxy = Proxy.create(handler, Object.getPrototypeOf(target));
      BaconMap[BaconID] = proxy;
      return proxy;
    } catch (err) {
      console.log("Error:");
      console.log(err.stack);
      throw err;
    } 
  }

  BaconTracer.proxyFunction = function (target) {
    return Proxy.createFunction(
      new ForwardingHandler(target),
      function() { 
        // trace();
        // console.log(target, arguments);            
        var targetFunResult = undefined;
        targetFunResult = target.apply(this, arguments);
        
        // Check if we want to encapsulate the result
        if (BaconInstance(targetFunResult)) {
          var proxy = BaconTracer.proxyObject(targetFunResult);
          if (BaconInstance(this))
            proxy.BaconInputs.push(this.BaconID);
          for (arg in arguments){
            var argument = arguments[arg];
            if (BaconInstance(argument))
              proxy.BaconInputs.push(argument.BaconID);
          }

          return proxy;
        }

        // if the passed object is Bacon.Bus and the result is not a Bacon type,
        // assume arguments go into the bus
        if (this instanceof Bacon.Bus) {
          for (arg in arguments){
            var argument = arguments[arg];
            if (BaconInstance(argument))
              this.BaconInputs.push(argument.BaconID);
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

  $.fn.asEventStream = BaconTracer.proxyFunction(Bacon.$.asEventStream);

  function trace() {
    try {
      throw new Error("myError");
    }
    catch(err) {
      console.log(err.stack);
    }
  }

  function BaconInstance(obj) {
    return obj instanceof Bacon.EventStream 
      || obj instanceof Bacon.Property 
      || obj instanceof Bacon.Observable 
      || obj instanceof Bacon.Bus;
  }

}).call(this);
