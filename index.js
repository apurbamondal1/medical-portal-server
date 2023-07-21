const express = require('express');
const cors = require('cors');
const port = process.env.PORT || 5000;
const app = express ();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config();


//middleware
app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.p33egdz.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
// client.connect(err => {
//   const collection = client.db("test").collection("devices");
//   // perform actions on the collection object
//   client.close();
// });

function verifyJWT (req, res, next){

const authHeader = req.headers.authorization;
if(!authHeader){
    return res.status(401).send('unauthorized access')
}
const token = authHeader.split(' ')[1];

jwt.verify(token, process.env.ACCESS_TOKEN, function(err,decoded){
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
// const usersCollection = client.db('doctor-portal-server').collection('users');
const usersCollection = client.db('doctor-portal-server').collection('users');
const doctorsCollection = client.db('doctor-portal-server').collection('doctors');
// const usersCollections = client.db('doctor-portal-server').collection('userss');


//use aggregate to query multiple collection then merge data
app.get('/appointmentOptions',async(req, res)=>{
  const query = {};
  const date = req.query.date;
  console.log(date)
   const options = await appointmentOptionsCollections.find(query).toArray();

 // get the bookings of the provided date
 const bookingQuery = { appointmentDate: date }
 const alreadyBooked = await bookingcollection.find(bookingQuery).toArray();


 // code carefully :D
 options.forEach(option => {
    const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
    const bookedSlots = optionBooked.map(book => book.slot);
    const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))

    // console.log(date,option.name, remainingSlots.length)
    option.slots = remainingSlots;
})


   res.send(options);
});

// app.post('/bookings',async (req, res) =>{
//    const booking = req.body;


//    const query = {
//     appointmentDate: booking.appointmentDate,
//     email: booking.email,
//     treatment: booking.treatment 
// }

// const alreadyBooked = await bookingcollection.find(query).toArray();

//             if (alreadyBooked.length){
//                 const message = `You already have a booking on ${booking.appointmentDate}`
//                 return res.send({acknowledged: false, message})
//             }
   
//    const result = await  bookingcollection.insertOne(booking);
//    res.send(result)
// } );


app.get('/bookings' , async (req , res) =>{
    const email = req.query.email;
    // const decodedEmail = req.decoded.email;
//     console.log( 'token' ,req.headers.authorization);
// if(email !== decodedEmail){
//     return res.status(403).send({message: 'forbidden access'})
// }


    const query ={email:email};
    const bookings = await bookingcollection.find(query).toArray();
    res.send(bookings)
});

   /***
         * API Naming Convention 
         * app.get('/bookings')
         * app.get('/bookings/:id')
         * app.post('/bookings') creat
         * app.patch('/bookings/:id')
         * app.delete('/bookings/:id')
        */

//    app.post('/users', async (req, res) => {
//     const user = req.body;
//     console.log(user);
//     const result = await usersCollection.insertOne(user);
//     res.send(result);
// });

// app.post('/users', async(req , res)=>{
//     const user = req.body;
//     const result = await usersCollection.insertOne(user);
//     res.send(result);
// });

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
     const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn: '365d'})
     return res.send({accessToken: token});   
    }
    res.status(403).send({accessToken: ''})
    // console.log(user);
    // res.status(403).send({accessToken: ''})
});


app.get('/users' , async(req , res) =>{
    const query = {};
    const users = await usersCollection.find(query).toArray();
    res.send(users);
});

app.get('/users/admin/:email' , async (req, res)=>{
    const email = req.params.id;
    const query = {email}
    const user = await usersCollection.findOne(query);
  console.log(user)
    res.send({ isAdmin: user?.role === 'admin'});

})

app.get('/appointmentSpecialty' , async(req, res)=>{
    const query = {}
    const result = await appointmentOptionsCollections.find(query).project({name: 1}).toArray();
    res.send(result);
})




app.post('/users', async(req , res)=>{
    const user = req.body;
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
    const filter = { _id: ObjectId(id) }
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

app.get('/doctors/' , async(req, res) =>{
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