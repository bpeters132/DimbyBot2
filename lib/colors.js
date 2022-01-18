
module.exports.random = () => {
    const hex = size => {
        var result = [];
        const hexRef = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
      
        for (var n = 0; n < size; n++) {
            result.push(hexRef[Math.floor(Math.random() * 16)]);
        }
        return result.join('');
    };
    return(`0x${hex(6)}`);
};