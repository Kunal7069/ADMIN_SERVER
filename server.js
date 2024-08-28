const express = require('express');
const { MongoClient } = require('mongodb');
const xlsx = require('xlsx');
const path = require('path');

const app = express();
const port = 3000;

// MongoDB connection URL
const url = 'mongodb://localhost:27017';
const dbName = 'RED-BUS';

app.use(express.json());

let db;

MongoClient.connect(url, { useUnifiedTopology: true })
  .then(client => {
    db = client.db(dbName);
    console.log('Connected to MongoDB');
  })
  .catch(err => {
    console.error('Error connecting to MongoDB:', err);
  });

app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Fetch all items from the BUS collection
app.get('/search_route', async (req, res) => {
  try {
    var items = await db.collection('ROUTE').find().toArray();
    edges=[]
    for (let index = 0; index < items.length; index++) {
      var item=[];
      item.push(items[index]['STATION_1'].trim());
      item.push(items[index]['STATION_2'].trim());
      item.push(items[index]['ROUTE_NO']);
      item.push(items[index]['BUS_NO']);
      item.push(items[index]['DISTANCE']);
      edges.push(item);
    }
    
    const startStation = 'Kargil Chowk';
    const endStation = 'R Block';
    
    
    const graph = buildGraph(edges);
    const paths = findAllPaths(graph, startStation, endStation);
    console.log("PATHS",paths)
   
   
   
   
    for (let index = 0; index < paths.length; index++) {
        for (let index_2 = 1; index_2 < paths[index].length-1; index_2++) {
        
            var collection = db.collection('BUS_STOPS');
            
            var query_1 = {};
            var queryKeys_1 = [
                { field: 'BUS_NO', value: paths[index][index_2]['busNo'] },
                { field: 'BUS_STOPNAME', value: paths[index][index_2]['station'] }
            ];
            queryKeys_1.forEach(key => {
                query_1[key.field] = key.value;
            });
            var result_1 = await collection.find(query_1).toArray();
            try{
                var arrival_time=result_1[0]['ARRIVAL_TIME'];
            }
            catch{
                var arrival_time="12:01 AM"; 
            }
            
    
            var query_2 = {};
            var queryKeys_2 = [
                { field: 'BUS_NO', value: paths[index][index_2+1]['busNo'] },
                { field: 'BUS_STOPNAME', value: paths[index][index_2]['station'] }
            ];
            queryKeys_2.forEach(key => {
                query_2[key.field] = key.value;
            });
            var result_2 =await collection.find(query_2).toArray();
            var departure_time=result_2[0]['DEPARTURE_TIME'];
            
            if(compareTime(departure_time,arrival_time)!=1){
              console.log(index);
              var final_path=removeElementByIndex(paths, index);
            }
    
                }
           
    
        }  
        console.log("FINAL_PATHS",final_path)
        res.status(201).json({ message: 'FINDED' });
    // console.log(`Number of paths from ${startStation} to ${endStation}: ${paths.length}`);
    // paths.forEach((path, index) => {
    //     console.log(`Path ${index + 1}:`);
    //     path.forEach(({ station, routeNo, busNo, distance }, idx) => {
            
    //         console.log(`Station: ${station}, Route: ${routeNo}, Bus: ${busNo}`);
    //         if (idx === path.length - 1) {
    //             console.log(`Total Distance: ${distance}`);
    //         } 
    // });
//     console.log('---');
// });
    
  } catch (err) {
    res.status(500).json({ error: 'Error fetching items' ,err});
  }
});




app.get('/search_time', async (req, res) => {

  const collection = db.collection('BUS_STOPS');
  const query = {};
  const queryKeys = [
    { field: 'BUS_NO', value: 'BR05M P5676' },
    { field: 'BUS_STOPNAME', value: 'Bihta' }
  ];
  queryKeys.forEach(key => {
    query[key.field] = key.value;
  });
  const result = await collection.find(query).toArray();
  console.log('Query results:', result[0]['ARRIVAL_TIME'],result[0]['DEPARTURE_TIME']);
  res.status(201).json({ message: 'FINDED' });
});

app.post('/items', async (req, res) => {
  try {
    const newItem = req.body;
    const result = await db.collection('BUS').insertOne(newItem);
    res.status(201).json({ message: 'Item inserted', id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: 'Error inserting item' });
  }
});


function convertExcelTimeToTimeString(excelTime) {
  const totalMinutes = Math.round(excelTime * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const period = hours >= 12 ? 'PM' : 'AM';
  const formattedHours = hours % 12 || 12;
  const formattedMinutes = minutes.toString().padStart(2, '0');

  return `${formattedHours}:${formattedMinutes} ${period}`;
}


function buildGraph(edges) {
  const graph = {};

  edges.forEach(([station1, station2, routeNo, busNo, distance]) => {
      if (!graph[station1]) {
          graph[station1] = [];
      }
      if (!graph[station2]) {
          graph[station2] = [];
      }
      // Each connection now includes routeNo, busNo, and distance
      graph[station1].push({ station: station2, routeNo, busNo, distance });
      graph[station2].push({ station: station1, routeNo, busNo, distance }); // Uncomment if the graph is undirected
  });

  return graph;
}

function findAllPaths(graph, start, end, visited = new Set(), path = [], paths = []) {
  visited.add(start);

  if (path.length === 0) {
      path.push({ station: start, routeNo: null, busNo: null, distance: 0 });
  }

  if (start === end) {
      paths.push([...path]);
  } else {
      graph[start].forEach(({ station: neighbor, routeNo, busNo, distance }) => {
          if (!visited.has(neighbor)) {
              const totalDistance = path[path.length - 1].distance + distance;
              path.push({ station: neighbor, routeNo, busNo, distance: totalDistance });
              findAllPaths(graph, neighbor, end, visited, path, paths);
              path.pop();
          }
      });
  }

  visited.delete(start);
  return paths;
}


app.get('/save_bus_stop', async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'BUS_STOP_DETAILS.xlsx');
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet);
    const formattedData = jsonData.map(item => {
      if (item.DEPARTURE_TIME) {
        item.DEPARTURE_TIME = convertExcelTimeToTimeString(item.DEPARTURE_TIME);
      }
      if (item.ARRIVAL_TIME) {
        item.ARRIVAL_TIME = convertExcelTimeToTimeString(item.ARRIVAL_TIME);
      }
      const result =  db.collection('BUS_STOPS').insertOne(item);
      return result;
    });
    res.json(formattedData);
  } catch (err) {
    res.status(500).json({ error: 'Error reading Excel file' });
  }
});



app.get('/save_bus', async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'BUS_DETAILS.xlsx');
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet);
    const formattedData = jsonData.map(item => {
    const result =  db.collection('BUS').insertOne(item);
      return result;
    });
    res.json(formattedData);
  } catch (err) {
    res.status(500).json({ error: 'Error reading Excel file' });
  }
});

app.get('/save_route', async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'ROUTE_888_BR07VH8849.xlsx');
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet);
   
    result=[]
    for (let index = 0; index < jsonData.length-1; index++) {
        dis= subtractDistances(jsonData[index+1]['DISTANCE'],jsonData[index]['DISTANCE']);
        med={
          "BUS_NO":jsonData[index]['BUS_NO'],
          "ROUTE_NO":jsonData[index]['ROUTE_NO'],
          "STATION_1":jsonData[index]['STOPS'],
          "STATION_2":jsonData[index+1]['STOPS'],
          "DISTANCE":dis
        }
        const result =  db.collection('ROUTE').insertOne(med);
      
    }
    res.json(jsonData);
  } catch (err) {
    res.status(500).json({ error: 'Error reading Excel file' });
  }
});

function compareTime(time1, time2) {
  const [time1Parts, time2Parts] = [time1, time2].map(time => {
      const [timePart, meridiem] = time.split(' ');
      let [hours, minutes] = timePart.split(':').map(Number);
      if (meridiem === 'PM' && hours !== 12) hours += 12;
      if (meridiem === 'AM' && hours === 12) hours = 0;
      return hours * 60 + minutes;
  });
  
  if (time1Parts < time2Parts) return -1;
  if (time1Parts > time2Parts) return 1;
  return 0;
  }
  
  
  function removeElementByIndex(arr, index) {
      if (index < 0 || index >= arr.length) {
        console.log("Invalid index");
        return arr;
      }
      
      arr.splice(index, 1);
      return arr;
    }
function subtractDistances(distance1, distance2) {
  // Extract numeric values and convert to numbers
  let value1 = parseFloat(distance1.split(' ')[0]);
  let value2 = parseFloat(distance2.split(' ')[0]);
  
  // Perform subtraction
  let result = value1 - value2;
  
  // Return result with km unit
  return result;
}

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
