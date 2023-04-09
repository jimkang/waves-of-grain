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
import { defaultTotalTicks, defaultSecondsPerTick } from './consts';
import { Undoer } from './updaters/undoer';
import { select } from 'd3-selection';

var randomId = RandomId();
var routeState;
var { getCurrentContext } = ContextKeeper();
var ticker;
var sampleDownloader;
var prob;
var chordPlayer;

(async function go() {
  window.onerror = reportTopLevelError;
  renderVersion();

  routeState = RouteState({
    followRoute,
    windowObject: window,
  });
  routeState.routeFromHash();
})();

async function followRoute({
  seed,
  totalTicks = defaultTotalTicks,
  secondsPerTick = defaultSecondsPerTick,
  minGrainLength = 0.1,
  maxGrainLength = 1.0,
  minGrainOffset = 0.0,
  maxGrainOffset = 1.0,
}) {
  if (!seed) {
    routeState.addToRoute({ seed: randomId(8) });
    return;
  }

  secondsPerTick = +secondsPerTick;
  minGrainLength = +minGrainLength;
  maxGrainLength = +maxGrainLength;
  minGrainOffset = +minGrainOffset;
  maxGrainOffset = +maxGrainOffset;

  var renderDensityCanvas = RenderTimeControlGraph({
    canvasId: 'density-canvas',
  });
  var densityUndoer = Undoer({
    onUpdateValue: callRenderDensityCanvas,
    storageKey: 'densityOverTimeArray',
  });
  var renderLengthCanvas = RenderTimeControlGraph({
    canvasId: 'length-canvas',
    lineColor: 'hsl(10, 60%, 40%)',
  });
  var lengthUndoer = Undoer({
    onUpdateValue: callRenderLengthCanvas,
    storageKey: 'lengthOverTimeArray',
  });
  var renderOffsetCanvas = RenderTimeControlGraph({
    canvasId: 'offset-canvas',
    lineColor: 'hsl(240, 60%, 40%)',
  });
  var offsetUndoer = Undoer({
    onUpdateValue: callRenderOffsetCanvas,
    storageKey: 'offsetOverTimeArray',
  });

  function callRenderDensityCanvas(newValue, undoer) {
    renderDensityCanvas({
      valueOverTimeArray: newValue,
      valueMax: tonalityDiamondPitches.length,
      onChange: undoer.onChange,
    });
  }

  function callRenderLengthCanvas(newValue, undoer) {
    renderLengthCanvas({
      valueOverTimeArray: newValue,
      valueMin: minGrainLength,
      valueMax: maxGrainLength,
      onChange: undoer.onChange,
    });
  }

  function callRenderOffsetCanvas(newValue, undoer) {
    renderOffsetCanvas({
      valueOverTimeArray: newValue,
      valueMin: minGrainOffset,
      valueMax: maxGrainOffset,
      onChange: undoer.onChange,
    });
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
    getTickLength,
  });

  sampleDownloader = SampleDownloader({
    sampleFiles: ['bagpipe-c.wav', 'flute-G4-edit.wav', 'trumpet-D2.wav'],
    localMode: true,
    onComplete,
    handleError,
  });
  sampleDownloader.startDownloads();

  renderDensityCanvas({
    valueOverTimeArray: densityUndoer.getCurrentValue(),
    valueMax: tonalityDiamondPitches.length,
    onChange: densityUndoer.onChange,
  });
  renderLengthCanvas({
    valueOverTimeArray: lengthUndoer.getCurrentValue(),
    valueMin: minGrainLength,
    valueMax: maxGrainLength,
    onChange: lengthUndoer.onChange,
  });
  renderOffsetCanvas({
    valueOverTimeArray: offsetUndoer.getCurrentValue(),
    valueMin: minGrainOffset,
    valueMax: maxGrainOffset,
    onChange: offsetUndoer.onChange,
  });

  (function renderGraphRangeLabels() {
    select('.min-length').text(minGrainLength);
    select('.max-length').text(maxGrainLength);
    select('.min-offset').text(minGrainOffset);
    select('.max-offset').text(maxGrainOffset);
  })();

  // TODO: Test non-locally.
  function onComplete({ buffers }) {
    console.log(buffers);
    chordPlayer = ChordPlayer({ ctx, sampleBuffer: buffers[2] });
    wireControls({
      onStart,
      onUndoDensity: densityUndoer.onUndo,
      onUndoLength: lengthUndoer.onUndo,
      onUndoOffset: offsetUndoer.onUndo,
      onPieceLengthChange,
      onTickLengthChange,
      totalTicks,
      secondsPerTick,
    });
  }

  function onTick({ ticks, currentTickLengthSeconds }) {
    console.log(ticks, currentTickLengthSeconds);
    chordPlayer.play(
      Object.assign(
        {
          currentTickLengthSeconds,
          grainLengths: lengthUndoer.getCurrentValue(),
          grainOffsets: offsetUndoer.getCurrentValue(),
          tickIndex: ticks,
        },
        getChord({
          ticks,
          probable: prob,
          densityOverTimeArray: densityUndoer.getCurrentValue(),
          totalTicks,
        })
      )
    );
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
