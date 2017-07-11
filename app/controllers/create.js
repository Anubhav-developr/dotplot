/* global saveAs, Fuse */

import Ember from 'ember';
import d3 from 'd3';
import _ from 'lodash';
import NProgress from 'ember-cli-nprogress';
import * as config from '../config';

export default Ember.Controller.extend({
    charge: 6,

    scale: 1,

    fuzzyNodes: [],

    fuzzyText: null,

    firstCreate: true,

    serverRender: false,

    firstFoci: {},

    radius: 5,

    labels: true,

    showNodeInfo: true,

    gravity: 8,

    nodes: [],

    notifications: Ember.inject.service('notification-messages'),

    // Set width and height according to screen resolution.
    init: function () {
        var width = (Ember.$(window).width() - 333) * 85 / 100;
        var height = Ember.$(window).height() * 65 / 100;

        this.set('width', width);
        this.set('height', height);
    },

    // Observe Show Labels toggle.
    labelToggle: function () {
        if (this.get('labels')) {
            this.send(
                'showLabels',
                this.get('frame'),
                true
            );
        } else {
            this.send('removeLabels');
        }

    }.observes('labels'),

    fuzzySearch: function () {
        if (this.get('fuzzyText').length > 3) {
            var fuse = new Fuse(this.get('fuzzyNodes'), config.fuzzyConf);

            var results = fuse.search(this.get('fuzzyText'));

            if (results.length) {
                this.send(
                    'nodeFilter',
                    results
                );
            } else {
                this.send(
                    'nodeFilter',
                    false
                );
            }
        } else {
            this.send(
                'nodeFilter',
                false
            );
        }
    }.observes('fuzzyText'),

    getNodes: function (frameType) {
        NProgress.start();

        var that = this;

        var column = this.get('selectedColumn').get('id');

        var nodes = [];

        // Ember promise.
        return new Ember.RSVP.Promise(function (resolve, reject) {
            if (frameType === "Single Choice") {
                if (!that.get('d3Init')) {
                    // Create new node objects from the existing.
                    that.get('store')
                        .findAll('node')
                        .then(function (response) {
                            response.forEach(function(node) {
                                var newNode = {
                                    id: node.get('id')
                                };

                                newNode[column] = node[column];
                                nodes.pushObject(newNode);
                            });

                            that.set('nodes', nodes);
                            resolve(nodes);
                        });
                } else {
                    // Use existing nodes data to create new nodes.
                    that.get('store')
                        .findAll('node')
                        .then(function (response) {
                            response.forEach(function(node) {
                                var nodeObject = that.get('nodes')
                                    .findBy('id', node.get('id'));

                                var newNode = {
                                    id: nodeObject.id,
                                    x: nodeObject.x,
                                    y: nodeObject.y,
                                    fill: nodeObject.fill
                                };

                                newNode[column] = node[column];
                                nodes.pushObject(newNode);
                            });

                            resolve(nodes);
                        });
                }
            } else if (frameType === "Multiple Choice") {
                that.get('store')
                    .findAll('node')
                    .then(function (response) {
                        response.forEach(function (node) {
                            var nodeObject = that.get('nodes')
                                .findBy('id', node.get('id'));

                            var first = true;

                            that.get('selectedColumn')
                                .get('choice')
                                .forEach(function (type) {
                                    var newNode = {};
                                    
                                    // Use existing nodes for first choice.
                                    if (first) {
                                        first = false;

                                        newNode = {
                                            id: nodeObject.id,
                                            x: nodeObject.x,
                                            y: nodeObject.y,
                                            fill: nodeObject.fill
                                        };
                                    } else {
                                        newNode = {
                                            id: nodeObject.id + '--' + type,
                                            x: nodeObject.x,
                                            y: nodeObject.y,
                                            fill: nodeObject.fill
                                        };
                                    }

                                    newNode[column] = type;
                                    nodes.pushObject(newNode);
                                });
                        });

                        resolve(nodes);
                    });
            } else {
                // Reject promise if invalid frame type.
                reject("Invalid FrameType: " + frameType);
            }
        });
    },

    getFoci: function (choices) {
        var that = this;

        var index = 0;

        var foci = [];

        // Number of foci required.
        var fociCount = choices.length;

        // Foci per row.
        var perRow = Math.ceil(Math.sqrt(fociCount));

        // Total number of rows.
        var numRow = Math.ceil(Math.sqrt(fociCount));

        for (var i = 0; i < numRow; i++) {
            var temp = Math.min(perRow, fociCount - (i * perRow));

            for (var j = 0; j < temp; j++) {
                // Caluclate foci X and Y coordinates.
                var point = {
                    id: choices[index],
                    text: choices[index],
                    x: Math.ceil((that.get('width') / (temp + 1)) * (j + 1)),
                    y: Math.ceil((that.get('height') / (numRow + 1)) * (i + 1))
                };

                index++;

                foci.pushObject(point);
            }
        }

        if (this.get('firstCreate')) {
            var firstFoci =  _.keyBy(foci, 'id');
            var fill = d3.scale
                .category20();

            firstFoci = _.mapKeys(firstFoci, function(value, key) {
                return fill(key);
            });

            this.set('firstFoci', firstFoci);
            this.set('firstCreate', false);
        }

        return foci;
    },

    actions: {
        loadSampleData: function () {
            this.set('projectId', 'sampleData');
            this.send('loadProject');
        },

        loadProject: function () {
            this.send('hideIntro');

            var that = this;

            var file = config.serverConf.apiEndpoint + this.get('projectId');

            Ember.$.get(file, function () {
                that.send(
                    'importJSONData',
                    file
                );

                that.send(
                    'hideModel',
                    'fileUpload'
                );
            }).fail(function () {
                // Shake effect if no title is provided.
                Ember.$('#fileUpload')
                    .removeClass('zoomIn')
                    .addClass('shake');

                // Remove class on animation complete.
                window.setTimeout(function () {
                    Ember.$('#fileUpload')
                        .removeClass('shake');
                }, 1000);
            });
        },

        changeColor: function (foci, event) {
            var color = event.target.value;

            d3.selectAll('.foci-' + foci.id)
                .transition()
                .style("fill", color)
                .style("stroke", d3.rgb(color).darker(2))
        },

        createFrame: function () {
            if (!this.get('frameTitle')) {
                // Shake effect if no title is provided.
                Ember.$('#createFrame')
                    .removeClass('zoomIn')
                    .addClass('shake');

                // Remove class on animation complete.
                window.setTimeout(function () {
                    Ember.$('#createFrame')
                        .removeClass('shake');
                }, 1000);
            } else {
                Ember.$('#createFrame')
                    .addClass('zoomIn');

                var frameType = this.get('selectedColumn')
                    .get('type');

                if (frameType === "Multiple Choice") {
                    // Hide the model.
                    this.send(
                        'hideModel',
                        'createFrame'
                    );

                    // Create multiple choice frame.
                    this.send('createMultipleChoice');
                } else if (frameType === "Single Choice") {
                    // Hide the model.
                    this.send(
                        'hideModel',
                        'createFrame'
                    );

                    // Create single choice frame.
                    this.send(
                        'createSingleChoice'
                    );
                }
            }
        },

        createSingleChoice: function () {
            var that = this;

            this.getNodes('Single Choice')
                .then(function (nodes) {
                    var choices = [];

                    nodes.forEach(function (node) {
                        if (!choices.includes(node[that.get('selectedColumn').get('id')])) {
                            choices.pushObject(node[that.get('selectedColumn').get('id')]);
                        }
                    });

                    // Calculate foci.
                    var foci = that.getFoci(choices);

                    // Create a new frame record.
                    var frame = that.get('store')
                        .createRecord('frame', {
                            id: that.get('selectedColumn').get('id'),
                            title: that.get('frameTitle'),
                            foci: foci,
                            radius: that.get('radius'),
                            nodes: nodes,
                            type: "Single Choice",
                            switch: "On Click"
                        });

                    // Plot the frame.
                    that.send(
                        'd3Init',
                        frame,
                        true
                    );
                });
        },

        createMultipleChoice: function () {
            var that = this;

            this.getNodes('Multiple Choice').then(function (nodes) {
                // Calcuate foci for frame.
                var foci = that.getFoci(that.get('selectedColumn')
                    .get('choice'));

                // Create a new frame record.
                var frame = that.get('store')
                    .createRecord('frame', {
                        id: that.get('selectedColumn').get('id'),
                        title: that.get('frameTitle'),
                        foci: foci,
                        radius: that.get('radius'),
                        nodes: nodes,
                        type: "Multiple Choice",
                        switch: "On Click"
                    });

                // Plot the frame
                that.send(
                    'd3Init',
                    frame,
                    true
                );
            });
        },

        createDialog: function () {
            if (this.get('csvFile')) {
                this.send(
                    'showModel',
                    'createFrame'
                );
            } else {
                this.send(
                    'showNotification',
                    'error',
                    'Please add a CSV file to create frames.',
                    true
                );
            }
        },

        deleteFrame: function (frame) {
            this.get('store')
                .deleteRecord(frame);

            this.send(
                'showNotification',
                'error',
                'Successfully deleted frame ' + frame.get('id') + '.',
                true
            );
        },


        hideIntro: function () {
            Ember.$('#dotplot-introSteps').remove();
            Ember.$('#dotplot-button-sampleData').remove();
        },

        showModel: function (modelId) {
            var dialog = document.querySelector('#' + modelId);

            dialog.showModal();
        },

        hideModel: function (modelId) {
            var dialog = document.querySelector('#' + modelId);

            dialog.close();
        },

        fileUpload: function (file, resetInput) {
            this.send('hideIntro');
            
            if (file[0].type === "application/json") {
                var jsonFile = URL.createObjectURL(file[0]);

                this.send(
                    'importJSONData',
                    jsonFile
                );

                this.send(
                    'hideModel',
                    'fileUpload'
                );

                resetInput();
            } else if (file[0].type === "text/csv") {
                // Get local file path.
                var csvFile = URL.createObjectURL(file[0]);

                this.set('csvFile', csvFile);

                this.send(
                    'importCSVData',
                    csvFile
                );

                this.send(
                    'hideModel',
                    'fileUpload'
                );

                resetInput();
            } else {
                this.send(
                    'hideModel',
                    'fileUpload'
                );

                this.send(
                    'showNotification',
                    'error',
                    'Invalid file type of uploaded file.',
                    true
                );

                resetInput();
            }
        },

        importJSONData: function (file) {
            NProgress.start();

            var that = this;

            var first = true;

            d3.json(file, function (project) {
                // Update width and height according to window size.
                var ratio = that.get('height') / project.height;

                var width = project.width * ratio;

                that.set('width', width);

                that.set('scale', ratio);

                d3.select(".dotplot-nodes > svg")
                    .attr('width', width)
                    .attr('height', that.get('height'));

                project.frames.forEach(function (frameData) {
                    var updateNodes =  new Ember.RSVP.Promise(function(resolve) {
                      frameData.nodes.forEach(function (node, index) {
                        var newNode = _.cloneDeep(node);

                        newNode.x = node.x * ratio;
                        newNode.y = node.y * ratio;

                        newNode.px = node.px * ratio;
                        newNode.py = node.py * ratio;

                        if (index === frameData.nodes.length - 1) {
                          resolve(true);
                        }
                      });
                    });

                    updateNodes.then(function (value) {
                      if (value) {
                        // Create a new frame record.
                        var frame = that.get('store')
                            .createRecord('frame', frameData);

                        if (first) {
                            that.send(
                                'selectFrame',
                                frame
                            );
                            first = false;
                        }
                      }
                    });

                    NProgress.inc();
                });
                NProgress.done();

                that.send(
                    'showNotification',
                    'success',
                    'Project file successfully imported.',
                    true
                );
            });
        },

        importCSVData: function (file) {
            NProgress.start();

            var that = this;

            // Loop : CSV rows.
            d3.csv(file, function (d) {
                d3.select(".dotplot-nodes > svg")
                    .attr('width', that.get('width'))
                    .attr('height', that.get('height'));

                // Loop : Column titles.
                _.forEach(d[0], function (column, id) {
                    // Select only non-text and question columns.
                    if (id.indexOf('TEXT') === -1 && id.indexOf('Q') === 0) {
                        // If the question is multiple choice.
                        if (id.indexOf('_') > 0) {
                            var newId = id.substr(0, id.indexOf('_'));

                            if (!that.get('store').hasRecordForId('column', newId)) {
                                // Create record for multiple choice question.
                                that.get('store')
                                    .createRecord('column', {
                                        id: newId,
                                        text: column.substr(0, column.indexOf('-')),
                                        choice: [],
                                        type: "Multiple Choice"
                                    });
                            } else {
                                // Push choice in choice array.
                                that.get('store')
                                    .findRecord('column', newId)
                                    .then(function (column) {
                                        column.get('choice').pushObject(id);
                                    });
                            }
                        } else {
                            that.get('store')
                                .createRecord('column', {
                                    id: id,
                                    text: column,
                                    type: "Single Choice"
                                });
                        }
                    }
                });
                NProgress.set(0.6);
            });

            d3.csv(file, function(error, rows) {
                rows.forEach(function(row, index) {
                    var node = {
                        id: row.V1
                    };
                    
                    var fuzzyNode = {};

                    if (index != 0) {
                        _.forOwn(row, function(value, key) {
                            if (value) {
                                node[key] = value;

                                // This is specific to Qualtrics and will be replaced in future.
                                if (_.isNaN(parseInt(value))) {
                                    fuzzyNode[key] = value;
                                }
                            }
                        });

                        var storeNode = that.get('store')
                            .createRecord('node', node);
                        
                        fuzzyNode['id'] = storeNode.get('id');
                        that.get('fuzzyNodes').pushObject(fuzzyNode);
                    }
                });
            });

            // Create node objects.
            d3.csv(file, function (rows) {
                rows.forEach(function (row, index) {
                    if (index !== 0) {
                        that.get('nodes')
                            .pushObject({
                                id: row.V1
                            });
                    }
                });

                NProgress.done();
                that.send(
                    'showNotification',
                    'success',
                    'CSV file successfully parsed.',
                    true
                );
            });
        },

        selectColumn: function (column) {
            // Highlight selected column.
            Ember.$("#column_" + column.get('id'))
                .addClass("active")
                .siblings()
                .removeClass('active');

            this.set('selectedColumn', column);

            // Set default frame title.
            this.set('frameTitle', column.get('text'));

            // Make frame field active.
            Ember.$("#frameTitle").addClass('is-focused');
        },

        d3Init: function (frame) {
            // Layout Initialised.
            this.set('d3Init', true);

            var that = this;

            var fill = d3.scale.category20();

            var nodeIds = "";

            // Drag to change foci location.
            var drag = d3.behavior
                .drag()
                .on('dragstart', function (d) {
                    that.send('removeLabels');

                    var nodes = that.get('frame')
                        .get('nodes')
                        .filterBy(
                            that.get('frame').get('id'),
                            d[that.get('frame').get('id')]
                        );

                    nodes = _.map(nodes, function (node) {
                        return "#" + node.id;
                    });

                    nodeIds = _.toString(nodes);
                })
                .on('drag', function () {
                    that.send(
                        'changeFoci',
                        nodeIds,
                        d3.event
                    );
                })
                .on('dragend', function (d) {
                    that.send(
                        'updateNodePosition',
                        d
                    );

                    that.send(
                        'showLabels',
                        that.get('frame'),
                        true
                    );
                });

            // Update node data.
            var node = d3.select(".dotplot-nodes > svg")
                .selectAll(".node")
                .data(frame.get('nodes'), function (d) {
                    return d.id;
                });

            // Remove nodes from the SVG that are not in the data.
            node.exit()
                .transition()
                .duration(100)
                .style("opacity", 0)
                .remove();

            // Create nodes that are not already present on the SVG.
            node.enter()
                .append("circle")
                .attr("class", function(d) {
                    return "node foci-" + d[frame.get('id')];
                })
                .attr("id", function (d) {
                    return d.id;
                })
                .attr("cx", function (d) {
                    return d.x;
                })
                .attr("cy", function (d) {
                    return d.y;
                })
                .attr("r", frame.get('radius'))
                .style("fill", function (d) {
                    // Define node fill if not already defined.
                    if (d.fill) {
                        return d.fill;
                    } else {
                        d.fill = fill(d[frame.get('id')]);
                        return d.fill;
                    }
                })
                .style("opacity", 0.7)
                .style("stroke", function (d) {
                    // Return darker shade of node fill.
                    return d3.rgb(d.fill).darker(2);
                })
                .on('click', function (d) {
                    if (d3.event.defaultPrevented) {
                        return;
                    } else if (that.get('showNodeInfo')) {
                        that.send(
                            'nodeClick',
                            d,
                            frame
                        );
                    } else {
                        return;
                    }
                })
                .call(drag);

            // Create force layout.
            if (this.get('serverRender')) {
                this.send(
                    'serverPlot',
                    frame,
                );
            } else {
                this.send(
                    'd3Plot',
                    frame,
                    true
                );
            }
        },

        updateNodePosition: function (node) {
            var that = this;

            this.get('frame')
                .get('nodes')
                .filterBy(
                    that.get('frame').get('id'),
                    node[that.get('frame').get('id')]
                )
                .forEach(function (node) {
                    var x = d3.select("[id="+ node.id +"]")
                        .attr("cx");
                    var y = d3.select("[id="+ node.id +"]")
                        .attr("cy");
                    
                    node.x = +x;
                    node.y = +y;
                });
        },

        changeFoci: function (nodeIds, event) {
            d3.selectAll(nodeIds)
                .attr("cx", function () {
                    return + d3.select(this).attr("cx") + event.dx;
                });

            d3.selectAll(nodeIds)
                .attr("cy", function () {
                    return + d3.select(this).attr("cy") + event.dy;
                });
        },

        nodeClick: function (node, frame) {
            // Reset node radius.
            d3.selectAll("[id^='" + this.get('node') + "']")
                .transition()
                .duration(500)
                .attr("r", frame.get('radius'));

            var nodeId = node.id;

            // Check if it's a duplicate node.
            if (node.id.indexOf('--') > 0) {
                nodeId = node.id.substr(0, node.id.indexOf('--'));
            }

            // Change radius on node selection.
            d3.selectAll("[id^=" + nodeId + "]")
                .transition()
                .duration(500)
                .attr("r", frame.get('radius') + 3);

            // Set global node variable.
            this.set('node', nodeId);

            // Display node info.
            this.send(
                'nodeInfo',
                nodeId
            );
        },

        nodeFilter: function(nodes) {
            if (nodes) {
                var that = this;

                d3.selectAll('circle.node')
                    .transition()
                    .duration(200)
                    .style("opacity", 0.3);

                _.map(nodes, function(node) {
                    return d3.selectAll("[id^=" + node + "]")
                        .transition()
                        .duration(500)
                        .attr("r", that.get('radius') + 3)
                        .style("opacity", 1);
                });
            } else {
                d3.selectAll('circle.node')
                    .transition()
                    .duration(200)
                    .attr("r", this.get('radius'))
                    .style("opacity", 0.7);
            }
        },

        nodeInfo: function (nodeId) {
            var info = [];

            this.get('store').findAll('frame').then(function (frames) {
                // Create node info object for each frame.
                frames.forEach(function (frame) {
                    var frameInfo = {
                        question: frame.get('title'),
                        answer: ""
                    };

                    // Get label values based on ids for each node.
                    frame.get('nodes').forEach(function (node) {
                        if (node.id.indexOf(nodeId) >= 0) {
                            var nodeCat = node[frame.get('id')];

                            var value = frame.get('foci')
                                .findBy('id', nodeCat)
                                .text;
                            
                            frameInfo.answer += value + " ";
                        }
                    });

                    info.pushObject(frameInfo);
                });
            });

            // Update info.
            this.set('info', info);

            // Fade-in node info.
            Ember.$("#nodeInfo").fadeIn();
        },

        hideNodeInfo: function () {
            var that = this;

            // Fade-out node info.
            Ember.$("#nodeInfo").fadeOut();

            // Reset node radius.
            d3.selectAll("[id^=" + this.get('node') + "]")
                .transition()
                .duration(500)
                .attr("r", that.get('frame').get('radius'));
        },

        serverPlot: function (frame) {
            var foci = _.keyBy(frame.get('foci'), 'id');
            
            var that = this;

            this.send('removeLabels');

            Ember.$.ajax({
                type: "POST",
                url: config.serverConf.renderEndpoint,
                data: {
                    id: frame.get('id'),
                    nodes: JSON.stringify(frame.get('nodes')),
                    foci: JSON.stringify(foci),
                    charge: that.get('charge'),
                    gravity: that.get('gravity'),
                    width: that.get('width'),
                    height: that.get('height')
                },
                success: function (data) {
                    frame.set('nodes', data);
                    
                    d3.select(".dotplot-nodes > svg")
                        .selectAll('circle.node')
                        .data(data, function (d) {
                            return d.id;
                        })
                        .transition()
                        .attr("cx", function (d) {
                            return d.x;
                        })
                        .attr("cy", function (d) {
                            return d.y;
                        });
                    
                    that.send(
                        'showNotification',
                        'success',
                        'Server render completed, you can now modify it.',
                        true
                    );

                    that.set('frame', frame);

                    if (that.get('labels')) {
                        that.send(
                            'showLabels',
                            frame,
                            true
                        );
                    }
                }
            });
        },

        d3Plot: function (frame, hard = false) {
            NProgress.set(0.4);

            // Show new labels.
            this.send('removeLabels');

            var that = this;

            var nodeData = frame.get('nodes');
            
            // For improved performance.
            var foci = _.keyBy(frame.get('foci'), 'id');

            // Update node data.
            var node = d3.select(".dotplot-nodes > svg")
                .selectAll('circle.node')
                .data(nodeData, function (d) {
                    return d.id;
                });

            // Move nodes towards different foci.
            function drawNode(alpha) {
                return function (d) {
                    var center = foci[d[frame.get('id')]];

                    d.x += (center.x - d.x) * 0.06 * alpha;
                    d.y += (center.y - d.y) * 0.06 * alpha;
                };
            }

            // Push same color node closer.
            function pushClose(alpha) {
                return function (d) {
                    var center = that.get('firstFoci')[d.fill];

                    d.x += (center.x - d.x) * 0.02 * alpha;
                    d.y += (center.y - d.y) * 0.02 * alpha;
                };
            }

            // Update node position with every tick.
            function tick(e) {
                NProgress.inc(e.alpha);

                if (e.alpha >= 0.06 && hard) {
                    node.each(pushClose(e.alpha));
                } else if (e.alpha <= 0.01) {
                    that.get('force').stop();
                } else {
                    node.each(drawNode(e.alpha));
                }

                node.attr("cx", function (d) {
                        return d.x;
                    })
                    .attr("cy", function (d) {
                        return d.y;
                    });
            }

            // Show labels and update nProgress.
            function end() {
                NProgress.inc();

                that.send(
                    'showNotification',
                    'success',
                    'Force layout completed, you can now modify it.',
                    true
                );

                that.set('frame', frame);

                if (that.get('labels')) {
                    that.send(
                        'showLabels',
                        frame,
                        true
                    );
                }
            }

            // Define force properties.
            var force = d3.layout
                .force()
                .nodes(nodeData)
                .size([that.get('width'), that.get('height')])
                .on("tick", tick)
                .on('end', end)
                .charge(-1 * that.get('charge'))
                .gravity((10 - that.get('gravity')) / 100);

            this.set('force', force);

            // Start the force layout.
            force.start();
        },

        removeLabels: function () {
            d3.select(".dotplot-nodes > svg")
                .selectAll('.label')
                .remove();
        },

        showLabels: function (frame, updatePosition) {
            var that = this;

            // Update label data.
            var label = d3.select(".dotplot-nodes > svg")
                .selectAll(".label")
                .data(frame.get('foci'));

            // Create labels that are not already present on the SVG.
            label.enter()
                .append("text")
                .attr("class", "label")
                .style("opacity", 0)
                .style("font-family", "Open Sans")
                .text(function (d) {
                    return d.text;
                })
                .attr("dx", function (d) {
                    if (updatePosition) {
                        // Find all nodes in the foci.
                        var nodes = frame.get('nodes')
                            .filterBy(frame.get('id'), d.id);

                        // Find node with minimum X coordinate.
                        var minXNode = _.minBy(nodes, function (node) {
                            return node.x;
                        });

                        // Find node with minimum Y coordinate.
                        var maxXNode = _.maxBy(nodes, function (node) {
                            return node.x;
                        });

                        // Calculate foci width.
                        var fociWidth = maxXNode.x - minXNode.x;

                        // Update label coordinate value.
                        d.labelx = minXNode.x + (fociWidth - this.getBBox().width) / 2;

                        if (!_.isNaN(d.labelx)) {
                            return d.labelx;
                        }
                    } else {
                        return d.labelx;
                    }
                })
                .attr("dy", function (d) {
                    if (updatePosition) {
                        // Find all nodes in the foci.
                        var nodes = frame.get('nodes')
                            .filterBy(frame.get('id'), d.id);

                        // Find node with minimum Y coordinate.
                        var maxYNode = _.maxBy(nodes, function (node) {
                            return node.y;
                        });

                        // Update label coordinate value.
                        d.labely = maxYNode.y + 25;

                        if (!_.isNaN(d.labely)) {
                            return d.labely;
                        }
                    } else {
                        return d.labely;
                    }
                })
                .each(function (d) {
                    // Remove if the option is not selected by anyone.
                    if (_.isNaN(d.labelx) || _.isNaN(d.labely)) {
                        this.remove();

                        _.remove(frame.get('foci'), {
                            id: d.id
                        });
                    }
                });

            // Fade-in effect.
            label.transition()
                .duration(500)
                .style("opacity", 0.7)
                .each("end", _.once(function () {
                    if (updatePosition) {
                        that.send(
                            'showNotification',
                            'success',
                            'Foci labels updated successfully.',
                            true
                        );
                    }

                    NProgress.done();
                }));
        },

        updateLabels: function () {
            // Hide the model.
            this.send(
                'hideModel',
                'editLabel'
            );

            // Remove existing labels.
            this.send('removeLabels');

            // Show new labels.
            this.send(
                'showLabels',
                this.get('frame'),
                true
            );
        },

        saveNodePositions: function (frame) {
            // Select all nodes on the SVG.
            var node = d3.select(".dotplot-nodes > svg")
                .selectAll('circle.node');

            // Find the node (Frame Model) and update coordinate values.
            node.each(function (node) {
                var nodeObject = frame.get('nodes')
                    .findBy('id', node.id);

                nodeObject.x = node.x;

                nodeObject.y = node.y;
            });
        },

        changeGravity: function (event) {
            // Get slider value when the value changes.
            this.set('gravity', parseInt(event.target.value));

            // Remove existing labels.
            this.send('removeLabels');         

            // Run the force layout again.
            if (this.get('serverRender')) {
                this.send(
                    'serverPlot',
                    this.get('frame'),
                );
            } else {
                this.send(
                    'd3Plot',
                    this.get('frame'),
                    false
                );
            }
        },

        changeCharge: function (event) {
            // Get slider value when the value changes.
            this.set('charge', parseInt(event.target.value));

            // Remove existing labels.
            this.send('removeLabels');

            // Run the force layout again.
            if (this.get('serverRender')) {
                this.send(
                    'serverPlot',
                    this.get('frame'),
                );
            } else {
                this.send(
                    'd3Plot',
                    this.get('frame'),
                    false
                );
            }
        },

        changeRadius: function (event) {
            // Select all nodes on the SVG.
            var node = d3.select(".dotplot-nodes > svg")
                .selectAll('circle.node');

            this.get('frame')
                .set('radius', parseInt(event.target.value));

            this.set('radius', parseInt(event.target.value));

            // Transition into new radius value.
            node.transition()
                .duration(1000)
                .attr('r', parseInt(event.target.value));
        },

        selectFrame: function (frame) {
            NProgress.start();

            // Remove existing labels.
            this.send('removeLabels');

            // Controller reference.
            var that = this;

            var nodeIds = "";
            
            // Drag to change foci location.
            var drag = d3.behavior
                .drag()
                .on('dragstart', function (d) {
                    that.send('removeLabels');

                    var nodes = frame.get('nodes')
                        .filterBy(
                            frame.get('id'),
                            d[frame.get('id')]
                        );

                    nodes = _.map(nodes, function (node) {
                        return "#" + node.id;
                    });

                    nodeIds = _.toString(nodes);
                })
                .on('drag', function () {
                    that.send(
                        'changeFoci',
                        nodeIds,
                        d3.event
                    );
                })
                .on('dragend', function (d) {
                    that.send(
                        'updateNodePosition',
                        d
                    );

                    that.send(
                        'showLabels',
                        that.get('frame'),
                        true
                    );
                });

            // Update node data.
            var node = d3.select(".dotplot-nodes > svg")
                .selectAll('circle.node')
                .data(frame.get('nodes'), function (d) {
                    return d.id;
                });

            // Remove nodes from the SVG that are not in the data.
            node.exit()
                .transition()
                .duration(500)
                .style('opacity', 0)
                .remove();

            // Create nodes that are not already present on the SVG.
            node.enter()
                .append("circle")
                .attr("class", "node")
                .attr("id", function (d) {
                    return d.id;
                })
                .attr("cx", function (d) {
                    var nodeId = d.id.substr(0, d.id.indexOf('--'));

                    // Check if it's a duplicate node.
                    if (nodeId) {
                        var mainNode = that.get('frame')
                            .get('nodes')
                            .findBy("id", nodeId);

                        if (mainNode) {
                            return mainNode.x;
                        } else {
                            return that.get('width') / 2;
                        }
                    } else {
                        return that.get('width') / 2;
                    }
                })
                .attr("cy", function (d) {
                    var nodeId = d.id.substr(0, d.id.indexOf('--'));

                    // Check if it's a duplicate node.
                    if (nodeId) {
                        var mainNode = that.get('frame')
                            .get('nodes')
                            .findBy("id", nodeId);

                        if (mainNode) {
                            return mainNode.y;
                        } else {
                            return that.get('height') / 2;
                        }
                    } else {
                        return that.get('height') / 2;
                    }
                })
                .attr("r", frame.get('radius'))
                .style("fill", function (d) {
                    return d.fill;
                })
                .style("opacity", 0.7)
                .style("stroke", function (d) {
                    return d3.rgb(d.fill).darker(2);
                })
                .on('click', function (d) {
                    if (d3.event.defaultPrevented) {
                        return;
                    } else if (that.get('showNodeInfo')) {
                        that.send(
                            'nodeClick',
                            d,
                            frame
                        );
                    } else {
                        return;
                    }
                })
                .call(drag);

            // Transition into the new node positions.
            node.transition().duration(1000)
                .attr('cx', function (d) {
                    return d.x;
                })
                .attr('cy', function (d) {
                    return d.y;
                })
                .each("end", _.once(function () {
                    if (that.get('labels')) {
                        NProgress.inc();

                        that.send(
                            'showLabels',
                            frame,
                            false
                        );
                    } else {
                        NProgress.done();
                    }
                }));


            this.set('frame', frame);
        },

        showNotification: function (type, message, clear) {
            switch (type) {
            case 'warning':
                this.get('notifications').warning(message, {
                    autoClear: clear,
                    clearDuration: 2000
                });
                break;

            case 'info':
                this.get('notifications').info(message, {
                    autoClear: clear,
                    clearDuration: 2000,
                    htmlContent: true
                });
                break;

            case 'error':
                this.get('notifications').error(message, {
                    autoClear: clear,
                    clearDuration: 2000
                });
                break;

            case 'success':
                this.get('notifications').success(message, {
                    autoClear: clear,
                    clearDuration: 2000
                });
                break;

            default:
                // Invalid Type.
            }
        },

        sendToServer: function (blob) {
            NProgress.start();

            var request = new XMLHttpRequest();

            var data = new FormData();

            var that = this;

            var type = 'Published';

            // Check if the project already exists.
            if (this.get('projectId')) {
                data.append('projectData', blob, this.get('projectId'));

                type = 'Updated';
            } else {
                // Generate unique project id.
                var projectId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxyxxx'.replace(/[xy]/g, function (c) {
                    var r = Math.random() * 16 | 0;
                    var v = c === 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });

                this.set('projectId', projectId);

                data.append('projectData', blob, projectId);
            }

            // Open connection.
            request.open('POST', config.serverConf.apiEndpoint, true);

            // Show notification on success.
            request.onreadystatechange = function () {
                if (request.readyState === 4 && request.status === 200) {
                    var projectLink = config.serverConf.previewEndpoint + request.responseText;

                    that.send(
                        'showNotification',
                        'info',
                        type + ':<a class="dotplot-notification-link" target=_blank href=' + projectLink + '><b>' + request.responseText + '</b></a>',
                        false
                    );
                }
            };

            // Track upload progress.
            request.upload.onprogress = function (e) {
                if (e.lengthComputable) {
                    NProgress.set(e.loaded / e.total);
                }
            };

            // Send data to the server.
            request.send(data);
        },

        exportData: function (type) {
            var project = {
                width: this.get('width'),
                height: this.get('height'),
                frames: []
            };

            var that = this;

            // Find all frame records.
            this.get('store').findAll('frame').then(function (frames) {
                frames.forEach(function (frame) {
                    // Create a copy of the frame.
                    var frameCopy = frame.toJSON();

                    // Add id to the copied frame.
                    frameCopy.id = frame.get('id');

                    // Push the updated frame data.
                    project.frames.pushObject(frameCopy);
                });

                // Create a new BLOB with the fileData.
                var blob = new Blob([JSON.stringify(project)], {
                    type: "application/json"
                });

                if (type === "publish") {
                    that.send(
                        'sendToServer',
                        blob,
                        'DotPlot.json'
                    );
                } else if (type === "save") {
                    saveAs(blob, "DotPlot.json");
                } else {
                    // Invalid Type.
                }
            });
        }
    }
});
