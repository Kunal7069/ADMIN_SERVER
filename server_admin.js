const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");


const app = express();
app.use(cors(
  {
    origin: '*', // Your frontend URL
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true
  }
));
app.use(express.json());

const port = 5000;



const url = "mongodb+srv://TEST:12345@mubustest.yfyj3.mongodb.net/";
const dbName = "RED-BUS";

let db;

MongoClient.connect(url, { })
  .then((client) => {
    db = client.db(dbName);
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("Error connecting to MongoDB:", err);
  });


app.get("/", (req, res) => {
 res.send("Hello World!");
});

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

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function haversineDistance(coords1, coords2) {
  const R = 6371; // Radius of the Earth in kilometers. Use 3958.8 for miles

  const lat1 = toRadians(coords1.lat);
  const lng1 = toRadians(coords1.lng);
  const lat2 = toRadians(coords2.lat);
  const lng2 = toRadians(coords2.lng);

  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c; // Distance in kilometers

  return distance;
}

function findCoordinatesWithinRange(centerCoords, coordsArray, range) {
  return coordsArray.filter(
    (coords) => haversineDistance(centerCoords, coords) <= range
  );
}

function checkBusTimeConflicts(data) {
  const timeTableMap = {}; // Maps day -> array of {startTime, endTime, station}
  const conflicts = []; // Array to collect all conflicts

  function convertToMinutes(time) {
      const [hours, minutes] = time.split(":").map(Number);
      return hours * 60 + minutes; // Convert time to total minutes for easy comparison
  }

  function convertMinutesToTime(minutes) {
      const hours = Math.floor(minutes / 60).toString().padStart(2, '0');
      const mins = (minutes % 60).toString().padStart(2, '0');
      return `${hours}:${mins}`;
  }

  for (const entry of data) {
      const { days, timetable } = entry;

      for (const day of days) {
          if (!timeTableMap[day]) {
              timeTableMap[day] = []; // Initialize the day array
          }

          for (const schedule of timetable) {
              const { station, arrival_time, departure_time } = schedule;

              const arrivalInMinutes = convertToMinutes(arrival_time);
              const departureInMinutes = convertToMinutes(departure_time);

              // Check for any overlapping time range on the same day
              for (const record of timeTableMap[day]) {
                  if (
                      (arrivalInMinutes >= record.startTime && arrivalInMinutes < record.endTime) ||
                      (departureInMinutes > record.startTime && departureInMinutes <= record.endTime) ||
                      (arrivalInMinutes <= record.startTime && departureInMinutes >= record.endTime)
                  ) {
                      // Add conflict to the array
                      conflicts.push({
                          day,
                          conflictingStations: [station, record.station],
                          conflictingTimes: [
                              { station, arrival_time, departure_time },
                              {
                                  station: record.station,
                                  arrival_time: convertMinutesToTime(record.startTime),
                                  departure_time: convertMinutesToTime(record.endTime)
                              }
                          ]
                      });
                  }
              }

              // Add the current time range to the map
              timeTableMap[day].push({
                  startTime: arrivalInMinutes,
                  endTime: departureInMinutes,
                  station
              });
          }
      }
  }

  // Return the list of conflicts
  return conflicts;
}


app.post("/get_bus_stations_coordinates", async (req, res) => {
  try {
    const collection = db.collection("BUS_STATIONS");
    const result = await collection.find({}).toArray();
    coordinates = [];
    for (let index = 0; index < result.length; index++) {
      coordinates.push({
        lat: result[index]["latitude"],
        lng: result[index]["longitude"],
      });
    }

    live_coordinate = req.body.live_coordinate;
    const nearbyCoords = findCoordinatesWithinRange(
      live_coordinate,
      coordinates,
      1
    );
    res.send(nearbyCoords);
  } catch (error) {
    res.status(500).json({ message: "Error getting data", error });
  }
});

app.get("/get_buses", async (req, res) => {
  try {
    
    const collection = db.collection("BUS_DETAILS");
    const result = await collection.find({}).toArray();
    buses = [];
    for (let index = 0; index < result.length; index++) {
      buses.push(result[index]["busno"]);
    }

    res.send(buses);
  } catch (error) {
    res.status(500).json({ message: "Error getting data", error });
  }
});

app.get("/get_complete_routes", async (req, res) => {
  try {
    const collection = db.collection("ROUTE_DETAILS");
    const result = await collection.find({}).toArray();

    res.send(result);
  } catch (error) {
    res.status(500).json({ message: "Error getting data", error });
  }
});
app.post("/get_route_via_routeno", async (req, res) => {
  try {
    const collection = db.collection("ROUTE_DETAILS");
    var routeno = req.body.routeno;
    const result = await collection.find({ routeno: routeno }).toArray();
    var route = [];
    for (let index = 0; index < result[0]["route"].length; index++) {
      route.push(result[0]["route"][index]["value"]);
    }
    res.send(route);
  } catch (error) {
    res.status(500).json({ message: "Error getting data", error });
  }
});

app.post("/check_time_table", async (req, res) => {
  try {
    const collection = db.collection("BUS_ROUTE_TIMETABLE");
    var busno = req.body.busno;
    var routeno = req.body.routeno;
    var selectedDays = req.body.selectedDays;
    var rows= req.body.rows;
    const result =await collection.find({ busno: busno,  routeno: { $ne: routeno } }).toArray();
    var data = [];
    for (let index = 0; index < result.length; index++) {
      data.push({
        "days":result[index]["days"],
        "timetable":result[index]["timetable"]
      });
    }
    data.push({
      "days":selectedDays,
      "timetable":rows
    })
    var conflicts = checkBusTimeConflicts(data);


    res.send(conflicts);
  } catch (error) {
    res.status(500).json({ message: "Error getting data", error });
  }
});





app.get("/get_route_numbers", async (req, res) => {
  try {
    const collection = db.collection("ROUTE_DETAILS");
    const result = await collection.find({}).toArray();
    var routes = [];
    for (let index = 0; index < result.length; index++) {
      routes.push(result[index]["routeno"]);
    }
    res.send(routes);
  } catch (error) {
    res.status(500).json({ message: "Error getting data", error });
  }
});

app.post("/check_busno_routeno", async (req, res) => {
  const { busno, routeno } = req.body;

  try {
    const collection = db.collection("BUS_DETAILS");
    const result = await collection.findOne({
      busno: busno,
      route: routeno,
    });

    if (result) {
      return res.status(200).json({ exists: true });
    } else {
      return res.status(200).json({ exists: false });
    }
  } catch (error) {
    console.error("Error checking route:", error);
    res.status(500).json({ message: "Error checking route", error });
  }
});


app.post("/get_timetable_days", async (req, res) => {
  const { busno, routeno } = req.body;

  try {
    const collection = db.collection("BUS_ROUTE_TIMETABLE");
    const result = await collection.findOne({
      busno: busno,
      routeno: routeno,
    });

    res.send(result)
  } catch (error) {
    console.error("Error checking route:", error);
    res.status(500).json({ message: "Error checking route", error });
  }
});

app.post("/get_bus_timetable", async (req, res) => {
  try {
    const collection = db.collection("BUS_DETAILS");
    busno = req.body.busno;
    const result = await collection.find({ busno: busno }).toArray();

    res.send(result[0]["rows"]);
  } catch (error) {
    res.status(500).json({ message: "Error getting data", error });
  }
});

app.post("/search_route", async (req, res) => {
  try {
    const collection = db.collection("BUS_DETAILS");
    const station_from = req.body.station_from;
    const station_to = req.body.station_to;

    // MongoDB aggregation pipeline
    const result = await collection
      .aggregate([
        {
          $match: {
            route: {
              // Ensure both stations are present in the route array
              $all: [station_from, station_to],
            },
          },
        },
        {
          $addFields: {
            from_index: { $indexOfArray: ["$route", station_from] },
            to_index: { $indexOfArray: ["$route", station_to] },
          },
        },
        {
          // Filter the results where 'station_from' appears before 'station_to'
          $match: {
            $expr: { $lt: ["$from_index", "$to_index"] },
          },
        },
      ])
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).json({ message: "Error getting data", error });
  }
});

app.get("/get_bus_analyses", async (req, res) => {
  try {
    const collection = db.collection("BUS_DETAILS");
    const data = await collection.find({}).toArray();
    res.send(data);
  } catch (error) {
    res.status(500).json({ message: "Error getting data", error });
  }
});

app.get("/get_routes", async (req, res) => {
  try {
    const collection = db.collection("ROUTE_DETAILS");
    const data = await collection.find({}).toArray();
    res.send(data);
  } catch (error) {
    res.status(500).json({ message: "Error getting data", error });
  }
});
 
app.post("/get_bus_details", async (req, res) => {
  try {
    const collection = db.collection("BUS_DETAILS");
    busno = req.body.busno;
    const result = await collection.find({ busno: busno }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).json({ message: "Error getting data", error });
  }
});

app.post("/delete_bus_data", async (req, res) => {
  try {
    const collection_1 = db.collection("BUS_DETAILS");
    const collection_2 = db.collection("BUS_ROUTE_TIMETABLE");
    const busno = req.body.busno;

    const result_1 = await collection_1.deleteMany({ busno: busno });
    const result_2 = await collection_2.deleteMany({ busno: busno });

    if (result_1.deletedCount > 0) {
      res.json({ message: `${result_1.deletedCount} entries deleted successfully.` });
    } else {
      res.status(404).json({ message: "No entries found with the specified bus number." });
    }
  } catch (error) {
    res.status(500).json({ message: "Error deleting data", error });
  }
});

app.post("/update_bus_timetable", async (req, res) => {
  try {
    const collection = db.collection("BUS_DETAILS");
    const { busno, rows } = req.body;

    const updateResult = await collection.updateOne(
      { busno: busno },
      { $set: { rows: rows } }
    );

    res.send(updateResult);
  } catch (error) {
    res.status(500).json({ message: "Error getting data", error });
  }
});

app.post("/save_bus_stop", async (req, res) => {
  try {
    const collection = db.collection("BUS_STATIONS");
    const result = await collection.insertOne({
      name: req.body.name,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ message: "Error saving data", error });
  }
});

app.post("/save_route", async (req, res) => {
  try {
    const collection = db.collection("ROUTE_DETAILS");
    const result = await collection.insertOne({
      routeno: req.body.routeno,
      startpoint: req.body.startpoint,
      endpoint: req.body.endpoint,
      route: req.body.route,
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ message: "Error saving data", error });
  }
});

app.post("/save_bus_route", async (req, res) => {
  try {
    const collection = db.collection("BUS_ROUTE_TIMETABLE");
    const result = await collection.insertOne({
      busno: req.body.busno,
      routeno: req.body.routeno,
      days: req.body.selectedDays,
      timetable: req.body.timeTable,
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ message: "Error saving data", error });
  }
});

app.post("/update_bus_route", async (req, res) => {
  try {
    const collection = db.collection("BUS_ROUTE_TIMETABLE");

    const { busno, routeno, selectedDays, rows } = req.body;

    // Update the document if it exists, otherwise create a new one
    const result = await collection.updateOne(
      { busno, routeno },
      {
        $set: {
          days: selectedDays || [],
          timetable: rows || [],
        },
      },
      { upsert: true } // Create a new document if no document matches the filter
    );

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: "Error saving data", error });
  }
});

app.post("/save_bus", async (req, res) => {
  try {
    const collection = db.collection("BUS_DETAILS");
    const result = await collection.insertOne({
      busno: req.body.busno,
      bustype: req.body.bustype,
      totalseats: req.body.totalseats,
      route: req.body.route,
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ message: "Error saving data", error });
  }
});

app.get("/get_bus_details", async (req, res) => {
  try {
    const collection = db.collection("BUS_DETAILS");
    const result = await collection.find({}).toArray();
    
    res.send(result);
  } catch (error) {
    res.status(500).json({ message: "Error getting data", error });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
