var protobuf = require('./')

var proto = ['message Test {',
'message Num {',
'  required int64 value = 1;',
'  optional string desc = 2;',
'}',
'repeated Num nums = 1;',
'}'].join('\n');


var messages = protobuf(proto)

var ex = {
nums :[
	{value: 4294967296, desc:"2^32"},
	{value: 4503599627370496, desc:"2^52"},
	{value: '321543615673276831', desc:"google dealid"},
	{value: '9223372036854775294', desc:"MAX"},
	{value: 1, desc:"1"},
]}


// 2^32   4294967296
// 2^52   4503599627370496
// MAX    9223372036854775294
// 2^63-1 9223372036854775807
// 2^64   18446744073709551615
var buf = messages.Test.encode(ex)



console.log('test message\n', ex)
console.log(buf)
console.log('encoded test message decoded\n', messages.Test.decode(buf))


buf = messages.Test.encode(messages.Test.decode(buf))
console.log('encoded test message decoded\n', messages.Test.decode(buf))


buf = messages.Test.encode(messages.Test.decode(buf))
console.log('encoded test message decoded\n', messages.Test.decode(buf))


