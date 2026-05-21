const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
const app = express();
const port = process.env.PORT;
const { MongoClient, ServerApiVersion } = require("mongodb");

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
