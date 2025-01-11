import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import {
  seatingData1,
  seatingData2,
  seatingData3,
  seatingData4,
  seatingData5,
  seatingData6,
  seatingData7,
  seatingData8,
  seatingData9,
  seatingData10,
} from "./constant.js";
import cors from "cors";
import mongoose from "mongoose";
import Pusher from "pusher";

dotenv.config();

// Create model based on the schema

// Mock Data for Seats (No DB interaction, just in-memory)
let seatsData = {};

const seatingDataList = [
  seatingData1,
  seatingData2,
  seatingData3,
  seatingData4,
  seatingData5,
  seatingData6,
  seatingData7,
  seatingData8,
  seatingData9,
  seatingData10,
];

const pusherServer = new Pusher({
  appId: process.env.API_ID, // Use the appId from the environment variable
  key: process.env.PUSHER_KEY, // It's a good idea to store other sensitive keys in the .env as well
  secret: process.env.PUSHER_SECRET, // Store your secret in the .env for security
  cluster: "ap2",
  useTLS: true, // Ensures secure connections
});
// Function to get random seating data
const getRandomSeatingData = () => {
  const randomIndex = Math.floor(Math.random() * seatingDataList.length);
  return seatingDataList[randomIndex];
};

// Create Express app
const app = express();
const server = http.createServer(app);

// Parse JSON requests
app.use(express.json());

const connectDb = async () => {
  try {
    const connect = await mongoose.connect(process.env.CONNECTION_STRING);
    console.log("Database Connected: ", connect.connection.name);
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
};

const seatingSchema = new mongoose.Schema({
  finalId: { type: String, required: true, unique: true },
  seatingDataNumber: { type: Number, required: true },
});

const SeatingData = mongoose.model("SeatingData", seatingSchema);
connectDb();
// Enable CORS for all HTTP requests
app.use(cors());

// Enable CORS for Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"], // Allow all HTTP methods
    allowedHeaders: ["*"], // Allow all headers
    transports: ["websocket", "polling"], // Explicitly specify transports
    credentials: true, // Allow credentials (cookies, etc.)
  },
});

// WebSocket connection handling
io.on("connection", (socket) => {
  console.log("New client connected");

  // Join a room based on finalId (movieId_date_showtime)
  socket.on("joinRoom", (finalId) => {
    socket.join(finalId);
    console.log(`User joined room: ${finalId}`);

    // Send current hold data when a new user joins
    if (seatsData[finalId]) {
      socket.emit("seating:status", seatsData[finalId].hold);
    }

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log("Client disconnected");
      socket.leave(finalId); // Leave the room when client disconnects
    });
  });

  // Handle seat hold event
  socket.on("holdSeat", (seat, movieId) => {
    const finalId = movieId;

    // Check if the seat is already on hold
    if (seatsData[finalId] && seatsData[finalId].hold.includes(seat)) {
      socket.emit("holdError", `Seat ${seat} is already on hold.`);
      return;
    }

    // Add the seat to the hold list
    if (!seatsData[finalId]) {
      seatsData[finalId] = getRandomSeatingData();
    }
    seatsData[finalId].hold.push(seat);
    console.log(seatsData[finalId].hold);
    // Broadcast the hold event to all clients in the room
    io.to(finalId).emit("ticket:hold", seatsData[finalId].hold);
    // io.to(finalId).emit("ticket:hold", seatsData[finalId].hold);
    console.log(
      `Broadcasting hold seats to room ${finalId}:`,
      seatsData[finalId].hold
    );

    socket.emit("holdSuccess", `Seat ${seat} is now on hold.`);
  });

  socket.on("releaseSeat", (seat, movieId) => {
    const finalId = movieId;

    // Check if the seat is currently on hold
    if (seatsData[finalId] && seatsData[finalId].hold.includes(seat)) {
      // Remove the seat from the hold list
      seatsData[finalId].hold = seatsData[finalId].hold.filter(
        (s) => s !== seat
      );
      console.log(`Seat ${seat} released from room ${finalId}`);

      // Broadcast the updated hold data to all clients in the room
      io.to(finalId).emit("ticket:release", seatsData[finalId].hold);
      console.log(
        `Broadcasting released seats to room ${finalId}:`,
        seatsData[finalId].hold
      );

      socket.emit("releaseSuccess", `Seat ${seat} is now released.`);
    } else {
      socket.emit("releaseError", `Seat ${seat} is not currently on hold.`);
    }
  });
});

app.get("/", (req, res) => {
  res.json("Server running");
});

app.post("/seatUpdates", async (req, res) => {
  const { channel, event, data } = req.body;

  // Check if the required fields are present in the request
  if (!channel || !event || !data) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Trigger the event on the specified channel
    await pusherServer.trigger(channel, event, { ...data, event: event });
    //console.log(`Event triggered on channel ${channel}: ${event}`, data);

    return res.status(200).json({
      seat: data,
      event: event,
      message: "Event triggered successfully",
    });
  } catch (error) {
    console.error("Error triggering event:", error);
    return res.status(500).json({ error: "Failed to trigger event" });
  }
});

// Route to get the current hold status for a specific movie showtime
app.get("/seating/:movieId_date_showtime", async (req, res) => {
  try {
    const { movieId_date_showtime } = req.params;

    // Construct the finalId to retrieve the seating data
    const finalId = movieId_date_showtime;

    const seatingRecord = await SeatingData.findOne({ finalId });

    console.log(finalId, seatingRecord);

    if (seatsData[finalId]) {
      res.json({ data: seatsData[finalId] });
    }
    // Check if data already exists for the finalId
    else if (seatingRecord) {
      // If data exists, just return it
      res.json({ data: seatingDataList[seatingRecord.seatingDataNumber] });
      seatsData[finalId] = seatingDataList[seatingRecord.seatingDataNumber];
      console.log("Existing data sent for", finalId);
    } else {
      // If no data exists, create new data and store it
      const index = Math.floor(Math.random() * seatingDataList.length);

      // Save the new seating data to MongoDB
      const newSeatingRecord = new SeatingData({
        finalId,
        seatingDataNumber: index,
      });
      seatsData[finalId] = seatingDataList[index];

      await newSeatingRecord.save();
      console.log("New data created and saved for", finalId);

      res.json({ data: seatingDataList[index] });
    }
  } catch (error) {
    res
      .status(500)
      .send({ message: "Internal Server Error", error: error.message });
    console.log(error.message);
  }
});

// Start the server
const port = process.env.PORT || 8080;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
