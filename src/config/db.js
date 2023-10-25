const mongoose = require( 'mongoose');

async function connect() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/DoAn', {useNewUrlParser: true, useUnifiedTopology: true})
        console.log('DB connect succsess!');
    } catch (err) {
        console.log('DB connect fail!');
        console.log(err.message);
    }
}

module.exports = {connect}
