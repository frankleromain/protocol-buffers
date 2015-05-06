var varint = require('varint')
var svarint = require('signed-varint')
var Long = require('long');

var longvarint = function(){
  var MSB = 0x80
    , REST = 0x7F
    , MSBALL = ~REST
    , INT = Math.pow(2, 31)
    , longInt = Long.fromNumber(INT, true);

  var encode =  function(num, out, offset) {
    out = out || []
    offset = offset || 0
    var oldOffset = offset

    num = Long.fromString(''+num, true, 10);

    while(num.compare(longInt) > -1) {
      out[offset++] = num.and(0xFF).or(MSB).toInt()
      num = num.div(128);
    }
    num = num.toInt();

    while(num & MSBALL) {
      out[offset++] = (num & 0xFF) | MSB
      num >>>= 7
    }
    out[offset] = num | 0

    encode.bytes = offset - oldOffset + 1
    return out
  };
  var decode = function (buf, offset) {
    var res    = Long.fromString('0', true, 10)
      , offset = offset || 0
      , shift  = 0
      , counter = offset
      , b
      , l = buf.length

    do {
      if(counter >= l) {
        decode.bytesRead = 0
        return undefined
      }
      b = Long.fromNumber(buf[counter++], true);
      if(shift < 28) {
        res = res.add(b.and(REST).shiftLeft(shift))
      }else {
        res = res.add(b.and(REST).multiply(Math.pow(2, shift)))
      }
      shift += 7
    } while (b >= MSB)

    decode.bytes = counter - offset

    return res.toString()
  };

  var encodingLength = function(val) {
    console.log('encodingLength', val, varint.encodingLength(val))
    return val < 0 ? 10 : varint.encodingLength(val)
  };

  return {
    encode: encode,
    decode: decode,
    encodingLength: encodingLength
  };

}();

var encoder = function(type, encode, decode, encodingLength) {
  encode.bytes = decode.bytes = 0

  return {
    type: type,
    encode: encode,
    decode: decode,
    encodingLength: encodingLength
  }
}

exports.make = encoder

exports.bytes = function(tag) {
  var bufferLength = function(val) {
    return Buffer.isBuffer(val) ? val.length : Buffer.byteLength(val)
  }

  var encodingLength = function(val) {
    var len = bufferLength(val)
    return varint.encodingLength(len) + len
  }

  var encode = function(val, buffer, offset) {
    var oldOffset = offset
    var len = bufferLength(val)

    varint.encode(len, buffer, offset)
    offset += varint.encode.bytes

    if (Buffer.isBuffer(val)) val.copy(buffer, offset)
    else buffer.write(val, offset, len)
    offset += len

    encode.bytes = offset - oldOffset
    return buffer
  }

  var decode = function(buffer, offset) {
    var oldOffset = offset

    var len = varint.decode(buffer, offset)
    offset += varint.decode.bytes

    var val = buffer.slice(offset, offset+len)
    offset += val.length

    decode.bytes = offset - oldOffset
    return val
  }

  return encoder(2, encode, decode, encodingLength)
}()

exports.string = function() {
  var encodingLength = function(val) {
    var len = Buffer.byteLength(val)
    return varint.encodingLength(len) + len
  }

  var encode = function(val, buffer, offset) {
    var oldOffset = offset
    var len = Buffer.byteLength(val)

    varint.encode(len, buffer, offset, 'utf-8')
    offset += varint.encode.bytes

    buffer.write(val, offset, len)
    offset += len

    encode.bytes = offset - oldOffset
    return buffer
  }

  var decode = function(buffer, offset) {
    var oldOffset = offset

    var len = varint.decode(buffer, offset)
    offset += varint.decode.bytes

    var val = buffer.toString('utf-8', offset, offset+len)
    offset += len

    decode.bytes = offset - oldOffset
    return val
  }

  return encoder(2, encode, decode, encodingLength)
}()

exports.bool = function() {
  var encodingLength = function(val) {
    return 1
  }

  var encode = function(val, buffer, offset) {
    buffer[offset] = val ? 1 : 0
    encode.bytes = 1
    return buffer
  }

  var decode = function(buffer, offset) {
    var bool = buffer[offset] > 0
    decode.bytes = 1
    return bool
  }

  return encoder(0, encode, decode, encodingLength)
}()

exports.int32 = function() {
  var decode = function(buffer, offset) {
    var val = varint.decode(buffer, offset)
    decode.bytes = varint.decode.bytes
    return val > 2147483647 ? val - 4294967296 : val
  }

  var encode = function(val, buffer, offset) {
    varint.encode(val < 0 ? val + 4294967296 : val, buffer, offset)
    encode.bytes = varint.encode.bytes
    return buffer
  }

  var encodingLength = function(val) {
    return varint.encodingLength(val < 0 ? val + 4294967296 : val)
  }

  return encoder(0, varint.encode, decode, encodingLength)
}()

exports.int64 = function() {
  var decode = function(buffer, offset) {
    var val = varint.decode(buffer, offset)

    if (val >= Math.pow(2,52)) {
      val = longvarint.decode(buffer, offset);
      decode.bytes = longvarint.decode.bytes
    }
    else {
      decode.bytes = varint.decode.bytes
    }
    return val
  }

  var encode = function(val, buffer, offset) {
    if (val < 0) {
      var last = offset + 9;
      varint.encode(val * -1, buffer, offset)
      offset += varint.encode.bytes - 1
      buffer[offset] = buffer[offset] | 0x80
      while (offset < last - 1) {
        offset++
        buffer[offset] = 0xff
      }
      buffer[last] = 0x01
      encode.bytes = 10
    } else if (val >= Math.pow(2,52)) {
      longvarint.encode(val, buffer, offset)
      encode.bytes = longvarint.encode.bytes
    }
    else {
      varint.encode(val, buffer, offset)
      encode.bytes = varint.encode.bytes
    }
    return buffer
  }

  var encodingLength = function(val) {
    return val < 0 ? 10 : varint.encodingLength(val)
  }

  return encoder(0, encode, decode, encodingLength)
}()

exports.sint32 =
exports.sint64 = function() {
  return encoder(0, svarint.encode, svarint.decode, svarint.encodingLength)
}()

exports.uint32 =
exports.uint64 =
exports.enum =
exports.varint = function() {
  return encoder(0, varint.encode, varint.decode, varint.encodingLength)
}()

// we cannot represent these in javascript so we just use buffers
exports.fixed64 =
exports.sfixed64 = function() {
  var encodingLength = function(val) {
    return 8
  }

  var encode = function(val, buffer, offset) {
    val.copy(buffer, offset)
    encode.bytes = 8
    return buffer
  }

  var decode = function(buffer, offset) {
    var val = buffer.slice(offset, offset + 8)
    decode.bytes = 8
    return val
  }

  return encoder(1, encode, decode, encodingLength)
}()

exports.double = function() {
  var encodingLength = function(val) {
    return 8
  }

  var encode = function(val, buffer, offset) {
    buffer.writeDoubleLE(val, offset)
    encode.bytes = 8
    return buffer
  }

  var decode = function(buffer, offset) {
    var val = buffer.readDoubleLE(offset)
    decode.bytes = 8
    return val
  }

  return encoder(1, encode, decode, encodingLength)
}()

exports.fixed32 = function() {
  var encodingLength = function(val) {
    return 4
  }

  var encode = function(val, buffer, offset) {
    buffer.writeUInt32LE(val, offset)
    encode.bytes = 4
    return buffer
  }

  var decode = function(buffer, offset) {
    var val = buffer.readUInt32LE(offset)
    decode.bytes = 4
    return val
  }

  return encoder(5, encode, decode, encodingLength)
}()

exports.sfixed32 = function() {
  var encodingLength = function(val) {
    return 4
  }

  var encode = function(val, buffer, offset) {
    buffer.writeInt32LE(val, offset)
    encode.bytes = 4
    return buffer
  }

  var decode = function(buffer, offset) {
    var val = buffer.readInt32LE(offset)
    decode.bytes = 4
    return val
  }

  return encoder(5, encode, decode, encodingLength)
}()

exports.float = function() {
  var encodingLength = function(val) {
    return 4
  }

  var encode = function(val, buffer, offset) {
    buffer.writeFloatLE(val, offset)
    encode.bytes = 4
    return buffer
  }

  var decode = function(buffer, offset) {
    var val = buffer.readFloatLE(offset)
    decode.bytes = 4
    return val
  }

  return encoder(5, encode, decode, encodingLength)
}()
