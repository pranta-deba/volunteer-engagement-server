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
    origin: [
      "http://localhost:5173",
      "https://carecrew-f18ce.web.app",
      "https://carecrew-f18ce.firebaseapp.com/",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).send({ message: "unauthorized access" });
  if (token) {
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      req.user = decoded;
      next();
    });
  }
};

async function run() {
  try {
    await client.connect();
    const volunteerCollection = client.db("careCrew").collection("volunteers");
    const requestedCollection = client.db("careCrew").collection("requests");

    /**************** TOKEN ***************/
    // add cookie
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });
    // clear cookie ui
    app.get("/logOut", (req, res) => {
      res.clearCookie("token", {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: 0,
      });
      res.send({ success: true });
    });
    /**************** TOKEN ***************/

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
      const page = parseInt(req.query.page);
      const size = parseInt(req.query.size);
      const result = await volunteerCollection
        .find()
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(result);
    });
    // count volunteers
    app.get("/volunteers_count", async (req, res) => {
      const count = await volunteerCollection.countDocuments();
      res.send({ count });
    });

    // all posts by different user
    app.get("/my_post", verifyToken, async (req, res) => {
      const tokenEmail = req.user.email;
      if (tokenEmail !== req.query.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
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
      const id = req.query.postId;
      const checked = await requestedCollection.findOne({
        postId: post.postId,
        "volunteer.email": post.volunteer.email,
      });
      if (checked) {
        return res.send({ error: "Already Requested!" });
      }
      const neededCount = await volunteerCollection.findOne({
        _id: new ObjectId(id),
      });
      if (neededCount.volunteersNeeded < 1) {
        return res.send({ error: "No Volunteers Needed!" });
      }
      const decreaseNeed = await volunteerCollection.updateOne(
        {
          _id: new ObjectId(id),
        },
        {
          $inc: { volunteersNeeded: -1 },
        }
      );
      const result = await requestedCollection.insertOne(post);
      res.send(result);
    });

    // all requests by different user
    app.get("/requests", async (req, res) => {
      const email = req.query.email;
      const query = { "organizer.email": email };
      const result = await requestedCollection.find(query).toArray();
      res.send(result);
    });

    // request status updated by owner
    app.put("/requests/:id", async (req, res) => {
      const id = req.params.id;
      const update = req.body;
      const result = await requestedCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: update },
        { upsert: true }
      );
      res.json(result);
    });

    // you requested post
    app.get("/my_requests", verifyToken, async (req, res) => {
      const email = req.query.email;
      const tokenEmail = req.user.email;
      if (tokenEmail !== email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const result = await requestedCollection
        .find({
          "volunteer.email": email,
        })
        .toArray();
      res.send(result);
    });
    // delete request
    app.delete("/requests/:id", async (req, res) => {
      const deleteId = req.params.id;
      const updateId = req.query.id;
      const increaseNeed = await volunteerCollection.updateOne(
        {
          _id: new ObjectId(updateId),
        },
        {
          $inc: { volunteersNeeded: +1 },
        }
      );
      const result = await requestedCollection.deleteOne({
        _id: new ObjectId(deleteId),
      });
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
