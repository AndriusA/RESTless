Bacon = require('baconjs')

// Packet size threshold forcing to DCH mode
var threshold = 500;
// 5 seconds delay to go from DCH to FACH
var demotionTimerDCH = 5000;
var demotionTimerFACH = 3000;


var networkEvents = new Bacon.Bus()
networkEvents.log("Network packet of size ")


function moreThanThreshold (val) {
	return val >= threshold;
}
function lessThanThreshold (val) {
	return val < threshold;
}

// DCH state is refreshed if:
// 1. It is already in DCH
// AND
// 2. Any network packet comes in within a timeout
// 
// The state is currently DCH if there has been a packet larger than a threshold
// since the last time there was no packet at all for longer than DCH demotion time
// (even smaller packets reset the timer when already in DCH)
var isDCH = networkEvents.filter(moreThanThreshold)
						 .awaiting(networkEvents.debounce(demotionTimerDCH))
						 .skipDuplicates()

// Changes from DCH = true to DCH = false indicate a demotion to FACH
var demotedToFACH = isDCH.changes().filter(function (val) { return !val}).not()

// Packets forcing/refreshing FACH state are the ones that are smaller than a threshold
// and are sent when the radio is NOT in DCH state (otherwise it stays in DCH)
var refreshedFACH = networkEvents.filter(lessThanThreshold)
								 .filter(isDCH.not())
								 .map(function() { return true})

var promotionFromFACH = isDCH.changes()
							 .filter(function(val) { return val })
							 .not()

// For each change into FACH state fire a timer even after the demotion timeout
// Using flatMapLatest if FACH is refreshed by another packet, only the latest timeout will count
// Also merge promotions to DCH to cancel the FACH timers if there are any
var FACHtimers = refreshedFACH.merge(demotedToFACH).merge(promotionFromFACH)
							 .flatMapLatest(function (v) {
							 	if (v == true)
							 		return Bacon.later(demotionTimerFACH, true)
							 	else
							 		return Bacon.never()
							 })

var transitionsFACH = new Bacon.mergeAll([demotedToFACH, 
										  refreshedFACH, 
										  promotionFromFACH,
										  FACHtimers.not()])

var isFACH = transitionsFACH.toProperty()

// The state is IDLE if FACH demotion timer has fired
var isIDLE = isDCH.not()
				  .and(isFACH.not())
				  .debounce(1)			// Allow a bit of time for changes to DCH and FACH affect each other
				  .skipDuplicates()

var stateTransitions = isDCH.changes()
							.flatMap(function (v) { 
								if (v) return "DCH"; else return Bacon.never(); 
							})
							.merge(isFACH.changes().flatMap(function (v) {
								if (v) return "FACH"; else return Bacon.never(); 	
							}))
							.merge(isIDLE.changes().flatMap(function (v) {
								if (v) return "IDLE"; else return Bacon.never(); 	
							}))

stateTransitions.log("Radio state: ")


// Scenario 1:
console.log("Scenario1: ")
networkEvents.plug(new Bacon.later(1000, 1000))
networkEvents.plug(new Bacon.later(2000, 101))
networkEvents.plug(new Bacon.later(3000, 101))
networkEvents.plug(new Bacon.later(7000, 104))
networkEvents.plug(new Bacon.later(9000, 102))
networkEvents.plug(new Bacon.later(15000, 1006))
networkEvents.plug(new Bacon.later(16000, 101))
networkEvents.plug(new Bacon.later(26000, 110))

// Scenario 2:
// Generate random events with random time intervals
// When a value comes in on a buffer, inject a new value with a random delay

// networkEvents.onValue(function (val) {
// 	Bacon.later(Math.random()*10000, Math.round(Math.random()*1500))
// 		.onValue(function (newValue) { 
// 			networkEvents.push(newValue)} 
// 		)
// })

// Trigger the start of network events
// networkEvents.plug(new Bacon.once(100));