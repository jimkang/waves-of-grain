#!/usr/bin/env node

var fs = require('fs');
var path = require('path');

/* global process */

if (process.argv.length < 4) {
  console.error(
    'Usage: node tools/add-tide-gauges-to-slr.js <SLR csv> <output dir path>'
  );
  process.exit(1);
}

// Boston mean sea level rise projection for 2.0m by 2100 (med) from here:
// https://oceanservice.noaa.gov/hazards/sealevelrise/sealevelrise-tech-report.html

// Values are in cm.
var bostonSLR = [
  {'2005': 0},
  {'2020': 10},
  {'2030': 19},
  {'2040': 31},
  {'2050': 45},
  {'2060': 66},
  {'2070': 93},
  {'2080': 123},
  {'2090': 157},
  {'2100': 190},
  {'2110': 227},
  {'2120': 262},
  {'2130': 295},
  {'2140': 320},
  {'2150': 342},
];


const inputPath = process.argv[2];
const outputDirPath = process.argv[3];
const basename = path.basename(inputPath, '.rlrdata');
const contents = fs.readFileSync(inputPath, { encoding: 'utf8' });
var lines = contents.trim().split('\n');
var rows = lines.map(parseLine);
fs.writeFileSync(path.join(outputDirPath, basename + '.json'), JSON.stringify(rows, null, 2), { encoding: 'utf8' });

function parseLine(line, lines, i) {
  var values = line.split(';');
  const [year, monthPart] = values[0].split('.');
  const month = +monthPart/10000*12;
  var date = new Date(year, month);
  var meanSeaLevelDeltaMM = +values[1];
  if (meanSeaLevelDeltaMM === -99999) {
    // There's no data for this month, so guess.
    if (i > 0) {
      meanSeaLevelDeltaMM = rows[i - 1].meanSeaLevelDeltaMM;
    } else {
      meanSeaLevelDeltaMM = 0;
    }
  }
  return { date, year, month, meanSeaLevelDeltaMM };
}

