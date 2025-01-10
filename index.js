import express from "express";
import http from "http";
import { Server } from "socket.io";
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

// Enable CORS for all incoming HTTP requests
app.use(
  cors({
    origin: "*", // Allow all origins
    methods: ["GET", "POST", "PUT", "DELETE"], // Allow specific HTTP methods
    allowedHeaders: ["Content-Type", "Authorization"], // Allow specific headers
    credentials: true, // Allow credentials (cookies, authorization headers, etc.)
  })
);

// Enable CORS for Socket.IO
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // Allow requests from the frontend
    methods: ["GET", "POST"], // Allow GET and POST methods
    allowedHeaders: ["Content-Type"], // Optionally add headers if needed
    credentials: true, // Allow credentials (cookies, authorization headers, etc.)
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

app.get("/", (req, res) => { res.json("Server running"); }); 

// Route to get the current hold status for a specific movie showtime
app.get("/seating/:movieId_date_showtime", (req, res) => {
  try {
    const { movieId_date_showtime } = req.params;

    // Split the movieId_date_showtime by underscore to extract movieId, date, and showtime
    const [movieId, date, showtime] = movieId_date_showtime.split("_");

    // Construct the finalId to retrieve the seating data
    const finalId = `${movieId}_${date}_${showtime}`;

    // Check if data exists for the finalId
    if (seatsData[finalId]) {
      res.json({ data: seatsData[finalId] });
      console.log("New data Send1");
    } else {
      seatsData[finalId] = getRandomSeatingData();
      //   console.log(seatsData[finalId]);
      console.log("New Data sent2");
      res.json({ data: seatsData[finalId] });
    }
  } catch (error) {
    res
      .status(500)
      .send({ message: "Internal Server Error", error: error.message });
  }
});

// Start the server
const port = process.env.PORT || 8080;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
