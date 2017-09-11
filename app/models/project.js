import DS from 'ember-data';
import Ember from 'ember';
import _ from 'lodash';


// This should be broken down.
function calcFocusCenter(dots, focus) {
  dots = _.filter(dots, ['layoutFocus', focus.id]);
  const x = _.meanBy(dots, 'x'),
        y = _.meanBy(dots, 'y');
  return { x, y };
}

function stretchLayout(canvasDims, padding, foci, dots) {
  // I want to spread out the foci such that they all fit on the screen, and
  // yet if there are only a few foci, they don't get pushed too far apart.
  // I can either code that, or simulate it with forces.

  // I should code it. We want the distance between foci to be within a certain
  // range. We haven't cared about how big each focus is, so we won't start
  // now. Due to how we calculate foci locations, we only need the distance
  // between the first two foci to approximate the distance between all.
  //
  // Let's just pick an optimal distance and try to match that with the
  // contraint that all dots must stay on the page.
  //
  // All the math is a little wrong because we're shifting the foci around
  // without touching the distance between dots.
  //
  // TODO I need to shift so the CENTERS match.

  const optimalXDistance = 100; // pixels
  const optimalYDistance = optimalXDistance * (canvasDims.height / canvasDims.width); // pixels

  if (foci.length === 1) { return dots; }

  const fociOneCenter = calcFocusCenter(dots, foci[1]);
  const fociZeroCenter = calcFocusCenter(dots, foci[0]);

  console.log('centers', fociOneCenter, fociZeroCenter);
  const xDistBetweenFoci = fociOneCenter.x - fociZeroCenter.x;

  const firstRowY = foci[0].y;
  const nextRowFoci = _.find(foci, f => f.y !== firstRowY);

  let xScaleFactor = optimalXDistance / xDistBetweenFoci;
  let yScaleFactor = 1;
  if (nextRowFoci) {
    let yDistBetweenFoci = calcFocusCenter(dots, nextRowFoci).y - fociZeroCenter.y;
    yScaleFactor = optimalYDistance / yDistBetweenFoci;
  }

  let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
  dots.forEach(d => {
    if (d.x < minX) { minX = d.x; }
    if (d.y < minY) { minY = d.y; }
    if (d.x > maxX) { maxX = d.x; }
    if (d.y > maxY) { maxY = d.y; }
  });

  const drawnWidth = maxX - minX,
        drawnHeight = maxY - minY;

  const oldCenterX = drawnWidth / 2 + minX,
        oldCenterY = drawnHeight / 2 + minY;
  const newCenterX = canvasDims.width / 2,
        newCenterY = canvasDims.height / 2;

  const xShift = newCenterX - oldCenterX,
        yShift = newCenterY - oldCenterY;

  console.log('old center', oldCenterX, oldCenterY);
  console.log('new center', newCenterX, newCenterY);
  console.log('x', xScaleFactor);
  console.log('y', yScaleFactor);

  if (drawnWidth * xScaleFactor > canvasDims.width) {
    xScaleFactor = canvasDims.width / drawnWidth;
  }
  if (drawnHeight * yScaleFactor > canvasDims.height) {
    yScaleFactor = canvasDims.height / drawnHeight;
  }

  console.log('x', xScaleFactor);
  console.log('y', yScaleFactor);

  const fociShifts = {};
  foci.forEach(focus => {
    const newX = focus.x * xScaleFactor + xShift,
          newY = focus.y * yScaleFactor + yShift;
    fociShifts[focus.id] = {
      x: newX - focus.x,
      y: newY - focus.y
    };
  });


  const newDots = dots.map(d => {
    d.x += fociShifts[d.layoutFocus].x;
    d.y += fociShifts[d.layoutFocus].y;
    return d;
  });

  const newDistance = calcFocusCenter(newDots, foci[1]).x - calcFocusCenter(newDots, foci[0]).x;
  console.log('Optimal', optimalXDistance, optimalYDistance);
  console.log('Old', xDistBetweenFoci);
  console.log('New', newDistance);

  return newDots;
}

function getDots(responses, layoutFrame, colorFrame) {
  // All the dots that are generated for the color frame should continue to
  // exist throughout all subsequent frames. This means that if the color frame
  // allows multiple answers for its question, there will continue to be
  // multiple dots per response for all frames. For other frames that also
  // allow multiple answers, the number of dots will be multiplicative.
  //
  // For example, response A for Q1 has answers "Maine" and "Vermont", for
  // Q2 has answers "Apple" and "Pear", and for Q3 has single answer "Left". If
  // Q1 is color frame and layout frame, response A has two dots ("Maine-Maine" and
  // "Vermont-Vermont") of two different colors in two different foci. If we now move
  // to Q2 as the layout frame, response A needs four dots: "Maine-Apple",
  // "Maine-Pear", "Vermont-Apple", "Vermont-Pair". Two dots are new. We'll
  // arbitrarily pick the first answer for Q2 to take the old dots and we'll
  // create the remaining two. Now if Q3 is the layout frame, we're back to two
  // dots: "Maine-Left" and "Vermont-Left".
  //
  // What the above shows is that there needs to be a distinction drawn between
  // the nodes that will transition on to each frame and those that will only
  // exist for the single frame. To do that, we need to make sure that those
  // dots that continue on have a consistent ID that depends on the color frame
  // but not the layout frame.

  let dots = [];
  const layoutCol = layoutFrame.columnId;
  const colorCol = colorFrame.columnId;

  responses.forEach(resp => {
    const layoutAns = resp.answerIds[layoutCol];
    const colorAns = resp.answerIds[colorCol];
    if (_.isEmpty(layoutAns)) { return; }

    layoutAns.forEach(layoutAnsId => {
      let dotTemplate = {
        id: resp.id,
        respId: resp.id,
        layoutFocus: layoutAnsId,
      };

      if (_.isEmpty(colorAns) || layoutCol === colorCol) {
        let dot = dotTemplate;
        dot.id += `:${layoutCol}_${layoutAnsId}`;
        if (layoutCol === colorCol) {
          dot.colorFocus = dot.layoutFocus;
        }
        dots.push(dot);
        return;
      }

      colorAns.forEach((colorAnsId, j) => {
        let dot = _.clone(dotTemplate);
        dot.colorFocus = colorAnsId;
        dot.id += `:${colorCol}_${colorAnsId}`;
        if (j > 0) {
          dot.id += `|${layoutCol}_${layoutAnsId}`;
        }
        dots.push(dot);
      });
    });
  });

  return dots;
}

export default DS.Model.extend({
  frames: DS.attr(),
  survey: DS.attr(),
  width: DS.attr('number'),
  height: DS.attr('number'),
  colorByFrameId: DS.attr(),
  currentFrameIndex: DS.attr(),
  layouts: DS.attr(),

  layoutHasBeenSimulated(layoutFrame, colorFrame) {
    const layouts = this.get('layouts');
    const colorFrameId = colorFrame.columnId,
          layoutFrameId = layoutFrame.columnId;
    return layouts[colorFrameId] && layouts[colorFrameId][layoutFrameId] &&
      _.has(layouts[colorFrameId][layoutFrameId][0], 'vx');
  },

  updateLayouts(layoutFrame, colorFrame, dots) {
    let layouts = this.get('layouts');
    const colorFrameId = colorFrame.columnId,
          layoutFrameId = layoutFrame.columnId;
    if (!layouts[colorFrameId]) {
      layouts[colorFrameId] = {};
    }
    layouts[colorFrameId][layoutFrameId] = dots;
    this.set('layouts', layouts);
    return dots;
  },

  dots(layoutFrame, colorFrame, canvasDims, padding) {
    let layouts = this.get('layouts');
    const colorFrameId = colorFrame.columnId,
          layoutFrameId = layoutFrame.columnId;
    let dots;

    if (layouts[colorFrameId] && layouts[colorFrameId][layoutFrameId]) {
      dots = layouts[colorFrameId][layoutFrameId];
    } else {
      dots = getDots(this.get('survey').responses, layoutFrame, colorFrame);
      const normedLayout = stretchLayout({ width: 10000, height: 10000}, { top: 0, left: 0, bottom: 0, right: 0 }, layoutFrame.foci, dots);
      this.updateLayouts(layoutFrame, colorFrame, normedLayout);
    }

    dots = stretchLayout(canvasDims, padding, layoutFrame.foci, dots);
    return dots;
  },

  colorByFrame: Ember.computed('frames', 'colorByFrameId', function() {
    const frameId = this.get('colorByFrameId');
    return _.find(this.get('frames'), ['columnId', frameId]);
  }),

  currentFrame: Ember.computed('frames', 'currentFrameIndex', {
    get() {
      const frames = this.get('frames'),
            i = this.get('currentFrameIndex');
      if (frames.length <= i) { return; }
      return frames[i];
    },
    set(key, value) {
      const frames = this.get('frames'),
            frame = value;
      this.set('currentFrameIndex', frames.indexOf(frame));
      return value;
    }
  }),

  getDotInfo(dot) {
    let info = [];

    const resp = _.find(this.get('survey').responses, ['id', dot.respId]);
    this.get('survey').columns.forEach(col => {
      if (!resp.answers[col.id]) { return; }
      info.push({
        question: col.question,
        answer: resp.answers[col.id].join('; ')
      });
    });

    return info;
  },

  hasPreviousFrame: Ember.computed('currentFrameIndex', function() {
    return this.get('currentFrameIndex') > 0;
  }),

  hasNextFrame: Ember.computed('currentFrameIndex', 'frames', function() {
    return this.get('currentFrameIndex') < this.get('frames').length - 1;
  }),

  frameAt(i) {
    const frames = this.get('frames');
    if (frames.length <= i) { return; }
    return frames[i];
  }
});
