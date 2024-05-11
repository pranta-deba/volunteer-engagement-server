const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

// mongodb config
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.girnwoz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// middleware
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

async function run() {
  try {
    await client.connect();
    const volunteerCollection = client.db("careCrew").collection("volunteers");
    const requestedCollection = client.db("careCrew").collection("requests");

    /************ CRUD **************/
    // add volunteer
    app.post("/volunteers", async (req, res) => {
      const post = req.body;
      const result = await volunteerCollection.insertOne(post);
      res.json(result);
    });

    // update volunteer
    app.put("/volunteers/:id", async (req, res) => {
      const id = req.params.id;
      const update = req.body;
      const result = await volunteerCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: update },
        { upsert: true }
      );
      res.json(result);
    });

    // delete volunteer
    app.delete("/volunteers/:id", async (req, res) => {
      const id = req.params.id;
      const result = await volunteerCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.json(result);
    });

    // all volunteers
    app.get("/volunteers", async (req, res) => {
      const result = await volunteerCollection.find().toArray();
      res.send(result);
    });

    // all posts by different user
    app.get("/my_post", async (req, res) => {
      const result = await volunteerCollection
        .find({
          "organizer.email": req.query.email,
        })
        .toArray();
      res.send(result);
    });

    // single volunteer by id
    app.get("/volunteers/:id", async (req, res) => {
      const id = req.params.id;
      const result = await volunteerCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // search volunteers by title and category
    app.get("/AllVolunteer", async (req, res) => {
      const search = req.query.search;
      let query = {
        $or: [
          {
            postTitle: { $regex: search, $options: "i" },
          },
          { category: { $regex: search, $options: "i" } },
        ],
      };
      const result = await volunteerCollection.find(query).toArray();
      res.send(result);
    });

    // add requests
    app.post("/requests", async (req, res) => {
      const post = req.body;
      const checked = await requestedCollection.findOne({
        postId: post.postId,
        "volunteer.email": post.volunteer.email,
      });
      if (checked) {
        return res.send({ error: "Already Requested!" });
      }
      const decreaseNeed = await volunteerCollection.updateOne(
        {
          _id: new ObjectId(post.postId),
        },
        {
          $inc: { volunteersNeeded: -1 },
        }
      );
      const result = await requestedCollection.insertOne(post);
      res.send(result);
    });

    // all requests
    app.get("/requests", async (req, res) => {
      const result = await requestedCollection.find().toArray();
      res.send(result);
    });

    /************ CRUD ****************/

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("careCrew server is available...");
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
