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

  this.BaconTracer = BaconTracer = {}

  BaconTracer.proxyObject = function (target) {
    var BaconName = "";
    // A list of Bacon Observables that the current one takes data from
    var BaconInputs = [];
    var handler = new ForwardingHandler(target);
    
    handler.get = function(rcvr, name) {
      // console.log(BaconName+"."+name);
      if (name === "BaconName") {
        // if (BaconName === "")
        //   return "NameNotSet";
        return BaconName;
      }
      if (name === "BaconInputs") {
        return BaconInputs;
      }

      if (typeof this.target[name] === "function") {
          // console.log(BaconName + "( " + name + " )");
          return BaconTracer.proxyFunction(this.target[name], this.target);
      }

      return this.target[name];
    };

    handler.set =  function(rcvr,name,val) {
      if (name === "BaconName") {
          BaconName += val;
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
        if (targetFunResult instanceof Bacon.EventStream 
          || targetFunResult instanceof Bacon.Property 
          || targetFunResult instanceof Bacon.Observable
          || targetFunResult instanceof Bacon.Bus) {

          // var tName = this.BaconName ? this.BaconName : "";
          var proxy = BaconTracer.proxyObject(targetFunResult);

          if (this.BaconName && (this instanceof Bacon.EventStream || this instanceof Bacon.Property || this instanceof Bacon.Observable || this instanceof Bacon.Bus))
            proxy.BaconInputs.push(this.BaconName);
          for (arg in arguments){
            var argument = arguments[arg];
            // if (argument instanceof Bacon.Property && argument.BaconName)
            if (argument.BaconName)
              proxy.BaconInputs.push(argument.BaconName);
          }

          return proxy;
        }

        // if the passed object is Bacon.Bus and the result is not a Bacon type,
        // assume arguments go into the bus
        if (this instanceof Bacon.Bus) {
          for (arg in arguments){
            var argument = arguments[arg];
            if (argument.BaconName)
              this.BaconInputs.push(argument.BaconName);
          }
        }
        return targetFunResult;
      },
      function() {
        // console.debug("Constructor called");
        var temp = function(){};
        var inst, ret;
        temp.prototype = target.prototype;
        inst = new temp;
        ret = target.apply(inst, arguments);
        var targetFunResult = Object(ret) === ret ? ret : inst;
        
        if (targetFunResult instanceof Bacon.Bus) {
          // console.debug("proxying");
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

}).call(this);
