// plot a histogram using the Google Chart API
function plotHistogram(count) {
  var vals = [];
  var props = [];
  var max = 0;
  for (var prop in count) {
    vals.push(count[prop]);
    props.push(prop);
    if (count[prop] > max) { max = count[prop]; }
  }
  document.write(
    '<img src="http://chart.apis.google.com/chart?cht=bvs&chs=250x100&chd=t:'+vals.join(',')+
       '&chxr=1,0,'+max+',1&chds=0,'+max+
       '&chxt=x,y&chxl=0:|'+props.join('|')+'"></img>');
}

function makeCustomProxyFactory() {
  var customProxies = new WeakMap();
  return {
    create: function(handler, proto) {
      var proxy = Proxy.create(handler, proto);
      customProxies.set(proxy, handler);
      return proxy;
    },
    handlerOf: function(proxy) {
      return customProxies.get(proxy);
    }
  };
}

function makeSimpleProfiler(target, targetName, factory) {
  var targetName = targetName;
  var handler = new ForwardingHandler(target);
  var count = Object.create(null);
  handler.get = function(rcvr, name) {
    console.log(targetName+"."+name);
    count[name] = (count[name] || 0) + 1;
    return this.target[name];
  };
  handler.targetName = targetName;
  return {
    proxy: factory.create(handler, Object.getPrototypeOf(target)),
    get stats() { return count; }
  };
}

function runApp(o) {
  o.foo; o.foo; o.foo;
  o.bar; o.bar;
  o.baz;
  o.func; o.func;
}

function init(){
  var factory = makeCustomProxyFactory();

  var subjectBase = { foo: 42, bar: 24, func: {one: 1, two: 2} };
  var subjectMeta = makeSimpleProfiler(subjectBase, "subject", factory);
  var subject = subjectMeta.proxy;
  console.log("handler", factory.handlerOf(subject))
  runApp(subject);

  // var func = subject.func;
  // func.one;
  // func.two;

  // var funcBase = subject.func;
  // var funcMeta = makeSimpleProfiler(funcBase, "func<-"+factory.handlerOf(subject).targetName, factory);
  // var func = funcMeta.proxy;

  var intermSubject = subject;

  var func = makeSimpleProfiler(intermSubject.func, "func<-"+factory.handlerOf(intermSubject).targetName, factory).proxy;
  func.one; func.one;
  func.two;

  // var varName = expr;
  // ||
  // \/
  // var varName = makeSimpleProfiler(expr, name, factory).proxy

  console.log("handler", factory.handlerOf(func))

  plotHistogram(subjectMeta.stats);
  // plotHistogram(funcMeta.stats);  
};

init();
