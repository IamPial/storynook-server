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
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
);
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello from backend");
});

const uri = process.env.MONGODB_URI;

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const verifyToken = async (req, res, next) => {
  let token = req.cookies?.token;
  console.log("token", token);

  if (!token) {
    const authHeader = req.headers?.authorization;
    token = authHeader?.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = { id: payload.sub || payload.userId };
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
      const { userId, search, amenities } = req.query;
      let query = {};

      //find user Id
      if (userId) {
        query.userId = userId;
      }

      //for searching with name
      if (search) {
        query.name = { $regex: search, $options: "i" };
      }

      //checked amenities array
      if (amenities) {
        const amenitiesArray = amenities.split(",");
        query.amenities = { $in: amenitiesArray };
      }

      const result = await addRoomCollection
        .find(query)
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
    app.post("/room", verifyToken, async (req, res) => {
      const roomData = req.body;
      roomData.userId = req.user.id;
      roomData.createdAt = new Date();
      const result = await addRoomCollection.insertOne(roomData);
      res.send(result);
    });

    //verify Token
    app.patch("/room/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const userId = req.user.id;
      const room = await addRoomCollection.findOne({ _id: new ObjectId(id) });

      if (room.userId !== userId) {
        return res.status(401).json({
          message: "Unauthorized",
        });
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
      const userId = req.user.id;
      const room = await addRoomCollection.findOne({ _id: new ObjectId(id) });
      if (room.userId !== userId) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }
      const result = await addRoomCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    //reading booking Data
    app.get("/booking", verifyToken, async (req, res) => {
      const userId = req.user.id;
      const result = await bookingRoomCollection.find({ userId }).toArray();
      res.send(result);
    });
    //creating booking Data
    app.post("/booking", verifyToken, async (req, res) => {
      const bookingData = req.body;
      bookingData.userId = req.user.id;
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
        const userId = req.user.id;
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
        res.send(result);
      } catch (error) {
        console.error("error:", error);
        return res.status(401).json({
          message: "Unauthorized",
        });
      }
    });

    //clear cookie with logout
    app.post("/api/auth/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
        })
        .json({ success: true, message: "Logged out successfully" });
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

//set token from the cookie
app.post("/auth/set-token", (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: "Token missing" });
  }

  res
    .cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    })
    .json({ success: true });
});

app.listen(port, () => {
  console.log(`Server is running on ${port}`);
});
