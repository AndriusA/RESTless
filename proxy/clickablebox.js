function xyFromEvent(v) {
    return [v.clientX, v.clientY];
}

function getDelta(t) {
    var a = t[1];
    var b = t[0];
    return [a[0] - b[0], a[1] - b[1]];
}

function add(p1, p2) {
    return [p1[0] + p2[0], p1[1] + p2[1]];
}

$().ready(function () {
    var block = $("#clickable-block");
    var html = $("html");
    var Bacon = makeBaconInterceptor(window.Bacon);

    var blockDragging = block.asEventStream('mousedown')
        .map(true)
        .merge(html.asEventStream('mouseup').map(false))
        .toProperty(false);
    blockDragging.BaconName = "blockDragging";
    console.log(blockDragging.BaconName);

    var deltas = html.asEventStream('mousemove').map(xyFromEvent).slidingWindow(2, 2).map(getDelta);
    deltas.BaconName = "deltas"

    // var bBus = window.Bacon.Bus();
    // var bBus = makeBaconInterceptor(bBus);
    // bBus.plug(deltas);

    // Just like deltas, but [0,0] when user is not dragging the box.
    // Already returns a metaobject...
    var draggingDeltas = Bacon.combineWith(getDraggingDelta, deltas, blockDragging);
    draggingDeltas.BaconName = "draggingDeltas";
    console.log("draggingDeltas", draggingDeltas.BaconName);

    var blockPosition = draggingDeltas.scan([0, 0], add);
    blockPosition.onValue(function (pos) {
        block.css({
            top: pos[1] + "px",
            left: pos[0] + "px"
        });
    });

    //Experiment with EventStreams
    var mouseDownES = block.asEventStream('mousedown').map(true);
    mouseDownES.BaconName = "mouseDownES";
    var mouseUpES = html.asEventStream('mouseup').map(false);
    mouseUpES.BaconName = "mouseUpES";
    var foo = mouseUpES.merge(mouseDownES);
    console.log(foo.BaconName);

});

function getDraggingDelta (delta, dragging) {
    if (!dragging) {
        return [0, 0];
    }
    return delta;
}

function makeBaconInterceptor(target) {
  var BaconName = "";
  var handler = new ForwardingHandler(target);
  
  handler.get = function(rcvr, name) {
    // console.log(BaconName+"."+name);
    if (name === "BaconName") {
        return BaconName;
    }

    if (typeof this.target[name] === "function") {
        return makeBaconFunctionInterceptor(this.target[name], this.target);
    }

    return this.target[name];
  };
  handler.set =  function(rcvr,name,val) {
    if (name === "BaconName") {
        BaconName += val;
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

$.fn.asEventStream = makeBaconFunctionInterceptor(Bacon.$.asEventStream);

// $.fn.asEventStream = Proxy.createFunction(
//     new ForwardingHandler(Bacon.$.)
// );

function makeBaconFunctionInterceptor(target) {
    var proxy = Proxy.createFunction(
        new ForwardingHandler(target),
        function() { 
            // console.log(target, arguments);            
            var targetFunResult = undefined;
            try {
                targetFunResult = target.apply(this, arguments);
            } catch (err) {
                console.log("Error:");
                console.log(err.stack);
                throw err;
            }

            // Check if we want to encapsulate the result
            if (targetFunResult instanceof Bacon.EventStream 
                    || targetFunResult instanceof Bacon.Property 
                    || targetFunResult instanceof Bacon.Observable) {

                var tName = this.BaconName ? this.BaconName : "";
                for (arg in arguments){
                    var argument = arguments[arg];
                    if (argument instanceof Bacon.Property)
                        // console.log("using Property", arguments[arg].BaconName );
                        tName += "--> " + argument.BaconName;
                    else if (argument instanceof Bacon.EventStream)
                        // console.log("using EventStream", arguments[arg].BaconName );
                        tName += "--> " + argument.BaconName;
                    else if (argument instanceof Bacon.Observable)
                        // console.log("using Observable", arguments[arg].BaconName );
                        tName += "--> " + argument.BaconName;
                }

                var proxy = makeBaconInterceptor(targetFunResult);
                proxy.BaconName = tName;
                return proxy;
            }
            return targetFunResult;
        },
        function() {
            return target.apply(this, arguments);
        }
    );
    return proxy;
}

function trace() {
    try {
        throw new Error("myError");
    }
    catch(e) {
        console.log(e.stack);
    }
}
