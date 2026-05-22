const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
const app = express();
const port = process.env.PORT;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

//middleware
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello from backend");
});

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("storynook");
    const addRoomCollection = db.collection("AddRoom");
    const bookingRoomCollection = db.collection("booking");

    //read data
    app.get("/room", async (req, res) => {
      const limit = req.query.limit ? parseInt(req.query.limit) : 0;
      const result = await addRoomCollection
        .find()
        .sort({ _id: -1 })
        .limit(limit)
        .toArray();
      res.send(result);
    });

    //room details
    app.get("/room/:id", async (req, res) => {
      const id = req.params.id;
      const result = await addRoomCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // creating room data
    app.post("/room", async (req, res) => {
      const roomData = req.body;
      console.log(roomData);
      const result = await addRoomCollection.insertOne(roomData);
      res.send(result);
    });

    // app.patch("/room/:id", async (req, res) => {
    //   const id = req.params.id;
    //   const updateData = req.body;
    //   console.log(updateData);
    //   const result = await addRoomCollection.updateOne(
    //     { _id: new ObjectId(id) },
    //     { $set: updateData },
    //   );
    //   res.send(result);
    // });

    // app.delete("/room/:id", async (req, res) => {
    //   const id = req.params.id;
    //   const result = await addRoomCollection.deleteOne({
    //     _id: new ObjectId(id),
    //   });
    //   console.log(result);
    //   res.send(result);
    // });

    //reading booking Data
    app.get("/booking", async (req, res) => {
      const bookingData = req.body;
      const result = await bookingRoomCollection.find(bookingData).toArray();
      res.send(result);
    });
    //creating booking Data
    app.post("/booking", async (req, res) => {
      const bookingData = req.body;
      console.log(bookingData);
      const result = await bookingRoomCollection.insertOne(bookingData);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on ${port}`);
});
