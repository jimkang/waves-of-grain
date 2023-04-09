import RouteState from 'route-state';
import handleError from 'handle-error-web';
import { version } from './package.json';
import ep from 'errorback-promise';
import ContextKeeper from 'audio-context-singleton';
//import { queue } from 'd3-queue';
import wireControls from './renderers/wire-controls';
import { Ticker } from './updaters/ticker';
import { SampleDownloader } from './tasks/sample-downloader';
import seedrandom from 'seedrandom';
import RandomId from '@jimkang/randomid';
import { createProbable as Probable } from 'probable';
import { ChordPlayer } from './updaters/chord-player';
import { getChord } from './updaters/get-chord';
import { RenderTimeControlGraph } from './renderers/render-time-control-graph';
import { tonalityDiamondPitches } from './tonality-diamond';
import { defaultTotalTicks, defaultSecondsPerTick, maxTickLength } from './consts';
import { Undoer } from './updaters/undoer';

const minGrainLength = 0.001;
const maxGrainLength = 1.0;

var randomId = RandomId();
var routeState;
var { getCurrentContext } = ContextKeeper();
var ticker;
var sampleDownloader;
var prob;
var chordPlayer;

var renderDensityCanvas = RenderTimeControlGraph({ canvasId: 'density-canvas' });
var densityUndoer = Undoer({ onUpdateValue: callRenderDensityCanvas, storageKey: 'densityOverTimeArray' });
var renderLengthCanvas = RenderTimeControlGraph({ canvasId: 'length-canvas', lineColor: 'hsl(10, 60%, 40%)' });
var lengthUndoer = Undoer({ onUpdateValue: callRenderLengthCanvas, storageKey: 'lengthOverTimeArray' });

function callRenderDensityCanvas(newValue, undoer) {
  renderDensityCanvas({
    valueOverTimeArray: newValue,
    valueMax: tonalityDiamondPitches.length,
    onChange: undoer.onChange
  });
}

function callRenderLengthCanvas(newValue, undoer) {
  renderLengthCanvas({
    valueOverTimeArray: newValue,
    valueMin: minGrainLength,
    valueMax: maxGrainLength,
    onChange: undoer.onChange
  });
}

(async function go() {
  window.onerror = reportTopLevelError;
  renderVersion();

  routeState = RouteState({
    followRoute,
    windowObject: window,
  });
  routeState.routeFromHash();
})();

async function followRoute({ seed, totalTicks = defaultTotalTicks, secondsPerTick = defaultSecondsPerTick }) {
  secondsPerTick = +secondsPerTick;

  if (!seed) {
    routeState.addToRoute({ seed: randomId(8) });
    return;
  }

  var { error, values } = await ep(getCurrentContext);
  if (error) {
    handleError(error);
    return;
  }

  var ctx = values[0];

  var random = seedrandom(seed);
  prob = Probable({ random });
  prob.roll(2);

  ticker = new Ticker({
    onTick,
    startTicks: 0,
    totalTicks,
    getTickLength
  }); 

  sampleDownloader = SampleDownloader({
    sampleFiles: ['bagpipe-c.wav', 'flute-G4-edit.wav', 'trumpet-D2.wav'],
    localMode: true,
    onComplete,
    handleError
  });
  sampleDownloader.startDownloads();

  renderDensityCanvas({
    valueOverTimeArray: densityUndoer.getCurrentValue(),
    valueMax: tonalityDiamondPitches.length,
    onChange: densityUndoer.onChange
  });
  renderLengthCanvas({
    valueOverTimeArray: lengthUndoer.getCurrentValue(),
    valueMin: minGrainLength,
    valueMax: maxGrainLength, 
    onChange: lengthUndoer.onChange
  });

  // TODO: Test non-locally.
  function onComplete({ buffers }) {
    console.log(buffers);
    chordPlayer = ChordPlayer({ ctx, sampleBuffer: buffers[2] });
    wireControls({
      onStart,
      onUndoDensity: densityUndoer.onUndo,
      onUndoTempo: lengthUndoer.onUndo,
      onPieceLengthChange,
      onTickLengthChange,
      totalTicks,
      secondsPerTick
    });
  }

  function onTick({ ticks, currentTickLengthSeconds }) {
    console.log(ticks, currentTickLengthSeconds); 
    chordPlayer.play(Object.assign({ currentTickLengthSeconds, grainLengths: lengthUndoer.getCurrentValue(), tickIndex: ticks }, getChord({ ticks, probable: prob, densityOverTimeArray: densityUndoer.getCurrentValue(),  totalTicks })));
  }

  function onPieceLengthChange(length) {
    routeState.addToRoute({ totalTicks: length });
  }

  function onTickLengthChange(length) {
    routeState.addToRoute({ secondsPerTick: length });
  }

  function getTickLength() {
    return secondsPerTick;
  }
}

function reportTopLevelError(msg, url, lineNo, columnNo, error) {
  handleError(error);
}

function renderVersion() {
  var versionInfo = document.getElementById('version-info');
  versionInfo.textContent = version;
}

// Responders

function onStart() {
  ticker.resume();
}

