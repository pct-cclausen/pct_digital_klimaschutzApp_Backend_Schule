const express = require("express");
const app = express();
const port = 3010;
const fs = require("fs");
const jose = require("jose");
const cors = require("cors");

const SERVER_PASSWORD = "test";

let scanEvents = [];
let knownCodes = [];

function loadServerState() {
  try {
    const stringState = fs.readFileSync("state.json");
    const state = JSON.parse(stringState);
    scanEvents = state.events;
    knownCodes = state.codes;

    console.log(
      "Started server with " +
        knownCodes.length +
        " known qr codes and " +
        scanEvents.length +
        " scan events!"
    );
  } catch (e) {
    if (e.message.indexOf("no such file or directory") === -1) {
      console.log("Unexpected error loading state.json", e);
    }
  }
}

function storeServerState() {
  const state = {
    events: scanEvents,
    codes: knownCodes,
  };

  const asString = JSON.stringify(state);

  fs.writeFileSync("state.json", asString);
}

loadServerState();

app.use(cors());

app.use(express.json());

app.get("/api/highscores", (req, res) => {
  const byName = {};
  for (const event of scanEvents) {
    byName[event.groupName] = (byName[event.groupName] || 0) + event.points;
  }

  const highscores = Object.keys(byName).map((name) => ({
    name,
    points: byName[name],
  }));

  highscores.sort((a, b) => b.points - a.points);

  res.json(highscores);
});

app.post("/api/add-points", async (req, res) => {
  const result = {
    qrCodeFound: null,
    scannedFirst: false,
  };

  try {
    const { payload } = await jose.jwtVerify(
      req.body.jwtScanned,
      new TextEncoder().encode(SERVER_PASSWORD)
    );

    const claims = payload;

    const id = Number(claims.jti);

    const localCode = knownCodes.find((lc) => lc.id === id);

    if (localCode != null) {
      result.qrCodeFound = localCode;

      const scannedBefore = scanEvents.find(
        (le) => le.qrId === id && le.groupName == req.body.groupName
      );
      if (scannedBefore == null) {
        scanEvents.push({
          groupName: req.body.groupName,
          points: localCode.points,
          qrId: localCode.id,
        });
        result.scannedFirst = true;
      }
    }
  } catch (e) {
    console.log("Bad QR Code", e);
  }

  storeServerState();

  res.json(result);
});

app.post("/api/create-qr-code", async (req, res) => {
  const { description, points, key } = req.body;

  if (key !== SERVER_PASSWORD) {
    res.sendStatus(401);
  }

  const id = knownCodes.length + 1;
  knownCodes.push({
    id,
    description,
    points,
  });

  const jwt = await new jose.SignJWT({
    jti: id + "",
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode(key));

  storeServerState();

  res.json(jwt);
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
