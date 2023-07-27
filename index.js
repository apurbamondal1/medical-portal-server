const express = require('express');
const cors = require('cors');
const port = process.env.PORT || 5000;
const app = express ();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")('sk_test_51NX8b7SBr3fYKIlCrFZvthS967LXuHjAGEd3ZaHoCVTc4aEhuFZfkf1RCZ6hRZwsGTJ0jecUYMGbolOcRaNRXwgz00APdKY7I4');

app.use(express.static("public"));
app.use(express.json());


const jwt = require('jsonwebtoken');
require('dotenv').config();


//middleware
app.use(cors());
app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.p33egdz.mongodb.net/?retryWrites=true&w=majority`;



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.p33egdz.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri)

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function verifyJWT (req, res, next){

const authHeader = req.headers.authorization;
if(!authHeader){
    return res.status(401).send('unauthorized access')
}
const token = authHeader.split(' ')[1];

jwt.verify(token, process.env.ACCESS_TOKEN, function(err, decoded){
    if (err){
        return res.status(403).send({message : 'forbidden access'})

    }
    req.decoded = decoded;
    next();
})

}





async function run(){
    try{
        // await client.connect()
const appointmentOptionsCollections = client.db('doctor-portal-server').collection('appointmentOptions');
const bookingcollection = client.db('doctor-portal-server').collection('bookings');
const usersCollection = client.db('doctor-portal-server').collection('users');
const doctorsCollection = client.db('doctor-portal-server').collection('doctors');
// const paymentsCollection = client.db('doctorsPortal').collection('payments');



//use aggregate to query multiple collection then merge data
app.get('/appointmentOptions',async(req, res)=>{
  const query = {};
  const date = req.query.date;
  console.log(date)
   const options = await appointmentOptionsCollections.find(query).toArray();

 // get the bookings of the provided date
 const bookingQuery = { appointmentDate: date }
 const alreadyBooked = await bookingcollection.find(bookingQuery).toArray();



 options.forEach(option => {
    const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
    const bookedSlots = optionBooked.map(book => book.slot);
    const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))

    // console.log(date,option.name, remainingSlots.length)
    option.slots = remainingSlots;
})


   res.send(options);
});



app.get('/v2/appointmentOptions', async (req, res) => {
    const date = req.query.date;
    const options = await appointmentOptionsCollections.aggregate([
        {
            $lookup: {
                from: 'bookings',
                localField: 'name',
                foreignField: 'treatment',
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $eq: ['$appointmentDate', date]
                            }
                        }
                    }
                ],
                as: 'booked'
            }
        },
        {
            $project: {
                name: 1,
                price: 1,
                slots: 1,
                booked: {
                    $map: {
                        input: '$booked',
                        as: 'book',
                        in: '$$book.slot'
                    }
                }
            }
        },
        {
            $project: {
                name: 1,
                price: 1,
                slots: {
                    $setDifference: ['$slots', '$booked']
                }
            }
        }
    ]).toArray();
    res.send(options);
})

app.post('/create-payment-intent', async (req, res) => {
    const booking = req.body;
    const price = booking.price;
    const amount = price * 100;

    const paymentIntent = await stripe.paymentIntents.create({
        currency: 'usd',
        amount: amount,
        "payment_method_types": [
            "card"
        ]
    });
    res.send({
        clientSecret: paymentIntent.client_secret,
    });
});

// app.post('/payments', async (req, res) =>{
//     const payment = req.body;
//     const result = await paymentsCollection.insertOne(payment);
//     const id = payment.bookingId
//     const filter = {_id: ObjectId(id)}
//     const updatedDoc = {
//         $set: {
//             paid: true,
//             transactionId: payment.transactionId
//         }
//     }
//     const updatedResult = await bookingsCollection.updateOne(filter, updatedDoc)
//     res.send(result);
// })




  // temporary to update price field on appointment options
        app.get('/addPrice', async (req, res) => {
            const filter = {}
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    price: 99
                }
            }
            const result = await appointmentOptionsCollections.updateMany(filter, updatedDoc, options);
            res.send(result);
        })


        app.get('/bookings/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const booking = await bookingcollection.findOne(query);
            res.send(booking);
        })



app.get('/bookings', verifyJWT, async (req, res) => {
    const email = req.query.email;
    const decodedEmail = req.decoded.email;

    if (email !== decodedEmail) {
        return res.status(403).send({ message: 'forbidden access' });
    }

    const query = { email: email };
    const bookings = await bookingcollection.find(query).toArray();
    res.send(bookings);
})


   /***
         * API Naming Convention 
         * app.get('/bookings')
         * app.get('/bookings/:id')
         * app.post('/bookings') creat
         * app.patch('/bookings/:id')
         * app.delete('/bookings/:id')
        */



app.post('/bookings',async (req, res) =>{
   const booking = req.body;


   const query = {
    appointmentDate: booking.appointmentDate,
    email: booking.email,
    treatment: booking.treatment 
}

const alreadyBooked = await bookingcollection.find(query).toArray();

            if (alreadyBooked.length){
                const message = `You already have a booking on ${booking.appointmentDate}`
                return res.send({acknowledged: false, message})
            }
   
   const result = await  bookingcollection.insertOne(booking);
   res.send(result)
} );




app.get( '/jwt' , async (req,res)=>{
    const email = req.query.email;
    const query = { email:email };
    const user =  await usersCollection.findOne(query);
    if(user){
     const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {expiresIn: '365d'})
     return res.send({accessToken: token});   
    }
    res.status(403).send({accessToken: ''})
});









app.get('/users/admin/:email' , async (req, res)=>{
    const email = req.params.email;
    const query = {email}
    const user = await usersCollection.findOne(query);
  console.log(user)
    res.send({ isAdmin: user?.role === 'admin'});
    
})

app.get('/users' , async(req , res) =>{
    const query = {};
    const users = await usersCollection.find(query).toArray();
    res.send(users);
});

app.post('/users', async(req , res)=>{
    const user = req.body;
    console.log(user)
    const result = await usersCollection.insertOne(user);
    res.send(result);
});


app.put('/users/admin/:id',verifyJWT, async(req, res)=>{
    const decodedEmail = req.decoded.email;
    const query = {email: decodedEmail};
    const user = await usersCollection.findOne(query);
     
    if (user?.role !== 'admin'){
        return res.status(403).send({message: 'forbiden access'})
    }


    const id = req.params.id;
    const filter = { _id: new ObjectId(id) }
    const options = { upsert: true};
    const updatedDoc = {
        $set:{
            role: 'admin'
        }
    }
    const result = await usersCollection.updateOne(filter, updatedDoc, options);
    res.send(result);
});




app.post('/doctors' , async(req, res) =>
{
const doctor = req.body;
const result = await doctorsCollection.insertOne(doctor);
res.send(result);

});

app.get('/appointmentSpecialty' , async(req, res)=>{
    const query = {}
    const result = await appointmentOptionsCollections.find(query).project({name: 1}).toArray();
    res.send(result);
})

app.get('/doctors' , async(req, res) =>{
    const query = {};
    const doctors = await doctorsCollection.find(query).toArray();
    res.send(doctors);
});

app.delete('/doctors/:id', async(req,res) =>{
    const id = req.params.id;
    const filter = {_id: ObjectId(id)};
    const result = await doctorsCollection.deleteOne(filter);
    res.send(result);
})

    }
    finally{

    }
}
run().catch(console.log)


app.get('/', async (req, res)=>{
    res.send('doctor portal server is ruunig');
})

app.listen(port, ()=>console.log(`docotrs portal running on ${port}`))
