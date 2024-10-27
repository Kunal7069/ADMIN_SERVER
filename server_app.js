const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");
const axios = require("axios");
const app = express();
app.use(
  cors({
    origin: "*", // Your frontend URL
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  })
);
app.use(express.json());

const port = 9000;

const url = "mongodb+srv://TEST:12345@mubustest.yfyj3.mongodb.net/";
const dbName = "RED-BUS";

let db;

MongoClient.connect(url, {})
  .then((client) => {
    db = client.db(dbName);
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("Error connecting to MongoDB:", err);
  });

app.get("/", (req, res) => {
  res.json({ status: "MY-BUS BACKEND IS RUNNING" });
});

function getDayFromDate(dateString) {
  const date = new Date(dateString);
  const daysOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const dayIndex = date.getDay();
  return daysOfWeek[dayIndex];
}
function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

app.get("/get_bus_stations", async (req, res) => {
  try {
    const collection = db.collection("BUS_STATIONS");
    const result = await collection.find({}).toArray();
    stations = [];
    for (let index = 0; index < result.length; index++) {
      stations.push(result[index]["name"]);
    }
    res.send(stations);
  } catch (error) {
    res.status(500).json({ message: "Error getting data", error });
  }
});

app.get("/get_eloc", async (req, res) => {
  try {
    const collection = db.collection("BUS_STATION_ADDRESS");
    const result = await collection.find({}).toArray();
    
    res.send(result);
  } catch (error) {
    res.status(500).json({ message: "Error getting data", error });
  }
});

app.post("/get_duration", async (req, res) => {
  try {
    const { start_station, end_station } = req.body; // Get input from user
    const collection = db.collection("BUS_STATION_ADDRESS");
    // Find the documents matching the start and end station names
    const result = await collection
      .find({
        name: { $in: [start_station, end_station] },
      })
      .toArray();
    // Extract eloc for start and end station
    const startStation = result.find(
      (station) => station.name === start_station
    );
    const endStation = result.find((station) => station.name === end_station);

    if (!startStation || !endStation) {
      return res.status(404).json({ message: "Stations not found" });
    }
  const elocString = `${startStation.eloc};${endStation.eloc}`; // Format the eLocs like "FKOWV8;XSW08E"
  const url = `https://apis.mappls.com/advancedmaps/v1/890814d4d077a249d2824317201f9c38/distance_matrix_eta/driving/${elocString}?rtype=0&region=IND`;
  try {
    // Call the Mappls Distance Matrix API
    const response = await axios.get(url, {
      headers: {
        accept: "application/json",
      },
    });
    // Send the response from the Mappls API back to the client
    const distance = response.data.results.distances[0][1];
    const duration = response.data.results.durations[0][1];
    console.log("DISTANCE",distance);
    console.log("TIME",duration);
    // Return only the distance and duration
    res.json({
      distance, // Distance in meters
      duration, // Duration in seconds
    });
  } catch (error) {
    res.status(500).json({ message: "Error getting data", error });
  }

}
catch (error) {
  res.status(500).json({ message: "Error getting data", error });
}
}
);

app.post("/find_routes", async (req, res) => {
  try {
    const { start_station, end_station, date, time } = req.body;
    const collection = db.collection("BUS_ROUTE_TIMETABLE");
    const busDetailsCollection = db.collection("BUS_DETAILS");
    const data = await collection.find({}).toArray();
    // const date = "2024-08-30";
    // const time = "00:00";
    const day = getDayFromDate(date);
    const userTimeInMinutes = timeToMinutes(time);
    const filteredRoutes = data.filter((route) => {
      if (!route.days.includes(day)) {
        return false;
      }
      const startIndex = route.timetable.findIndex(
        (t) => t.station === start_station
      );
      const endIndex = route.timetable.findIndex(
        (t) => t.station === end_station
      );
      if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
        return false;
      }
      const startStationDepartureTime =
        route.timetable[startIndex].departure_time;
      const startStationDepartureTimeInMinutes = timeToMinutes(
        startStationDepartureTime
      );
      return startStationDepartureTimeInMinutes > userTimeInMinutes;
    });
    for (let route of filteredRoutes) {
      const busDetails = await busDetailsCollection.findOne({
        busno: route.busno,
      });
      if (busDetails) {
        route.bustype = busDetails.bustype;
        route.totalseats = busDetails.totalseats;
      }
    }
    res.send(filteredRoutes);
  } catch (error) {
    res.status(500).json({ message: "Error getting data", error });
  }
});

async function periodicAPICall() {
    try {
        // Example API call, modify as needed
        const response = await fetch('https://admin-server-1-bblq.onrender.com/'); // Replace with your API
        console.log('Periodic API call data:', response);
    } catch (error) {
        console.error('Error during periodic API call:', error);
    }
}
setInterval(periodicAPICall, 10000); 

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
