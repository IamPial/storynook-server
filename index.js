const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
dotenv.config();
const app = express();
const port = process.env.PORT;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

//middleware
app.use(cookieParser());
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello from backend");
});

const uri = process.env.MONGODB_URI;

const JWKS = createRemoteJWKSet(new URL("http://localhost:3000/api/auth/jwks"));

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    next();
  } catch (error) {
    console.log("Token verify error:", error.message);
    return res.status(403).json({ message: "Forbidden" });
  }
};

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
    const userBookingCollection = db.collection("userBookingList");

    //read data
    app.get("/room", async (req, res) => {
      const limit = req.query.limit ? parseInt(req.query.limit) : 0;
      const userId = req.query.userId;
      const filterUserData = userId ? { userId } : {};
      const result = await addRoomCollection
        .find(filterUserData)
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
      roomData.createdAt = new Date();
      const result = await addRoomCollection.insertOne(roomData);
      res.send(result);
    });

    //verify Token
    app.patch("/room/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const userId = req.user.sub;
      const room = await addRoomCollection.findOne({ _id: new ObjectId(id) });
      if (room.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const updateData = req.body;
      const result = await addRoomCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData },
      );
      res.send(result);
    });

    app.delete("/room/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const userId = req.user.sub;
      const room = await addRoomCollection.findOne({ _id: new ObjectId(id) });
      if (room.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const result = await addRoomCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    //reading booking Data
    app.get("/booking", async (req, res) => {
      const { userId } = req.query;
      const filter = userId ? { userId } : {};
      const result = await bookingRoomCollection.find(filter).toArray();
      res.send(result);
    });
    //creating booking Data
    app.post("/booking", verifyToken, async (req, res) => {
      const bookingData = req.body;
      bookingData.status = "confirmed";
      const result = await bookingRoomCollection.insertOne(bookingData);

      await addRoomCollection.updateOne(
        { _id: new ObjectId(bookingData.roomId) },
        { $inc: { bookingCount: 1 } },
      );
      res.send(result);
    });

    app.patch("/booking/:id/cancel", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const userId = req.user.sub;
        const bookingData = await bookingRoomCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!bookingData) {
          return res.status(404).json({ message: "Booking not found" });
        }

        if (bookingData.userId !== userId) {
          return res.status(403).json({ message: "Forbidden" });
        }

        //changes the status confirmed to cancelled
        const result = await bookingRoomCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "cancelled" } },
        );

        //remove the booking id from the user collection
        await userBookingCollection.updateOne(
          { id: userId },
          { $pull: { bookings: id } },
        );

        //decrease the booking count
        if (bookingData.roomId) {
          await addRoomCollection.updateOne(
            { _id: new ObjectId(bookingData.roomId) },
            { $inc: { bookingCount: -1 } },
          );
        }
        res
          .status(200)
          .json({ message: "Booking cancelled", success: true, result });
      } catch (error) {
        console.error("Cancel Route Error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
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
