/**
* @author Lianna Eeftinck / https://github.com/Leeft
*/

import SCMAP from '../scmap';
import System from './system';
import SystemList from './systems';
import { allSystems } from './systems';
import Goods from './goods';
import Faction from './faction';
import Dijkstra from './dijkstra';
import Route from './route';
import UI from './ui';
import settings from './settings';
import SelectedSystemGeometry from './selected-system-geometry';
import xhrPromise from '../helpers/xhr-promise';
import { hasLocalStorage, hasSessionStorage } from './functions';
import { ui, renderer, scene } from '../starcitizen-webgl-map';

import THREE from 'three';
import TWEEN from 'tween.js';
import StateMachine from 'javascript-state-machine';
import RSVP from 'rsvp';
import $ from 'jquery';

const BLACK = new THREE.Color( 0x000000 );

class Map {
  constructor () {
    this.name = `Star Citizen Persistent Universe`;
    this.scene = new THREE.Scene();

    // No editing available for the moment (doesn't work yet)
    this.canEdit = false;
    //$('#map_ui li.editor').hide();

    this._interactables = [];
    this._route = null; // The main route the user can set

    this._selectorObject = this.createSelectorObject( 0x99FF99 );
    this.scene.add( this._selectorObject );

    this._mouseOverObject = this.createSelectorObject( 0x8844FF );
    this._mouseOverObject.scale.set( 4.0, 4.0, 4.0 );
    this.scene.add( this._mouseOverObject );

    this.__currentlySelected = null;

    this.animate = this._animate.bind( this );

    let map = this;

    const getSystems          = xhrPromise( $('#sc-map-configuration').data('systems-json') );
    const getStrategicValues  = xhrPromise( 'data/uee-strategic-values.json' );
    const getFactions         = xhrPromise( 'data/factions.json' );
    const getCrimeLevels      = xhrPromise( 'data/crime-levels.json' );
    const getGoods            = xhrPromise( 'data/goods.json' );

    RSVP.all([
      getSystems,
      getStrategicValues,
      getFactions,
      getCrimeLevels,
      getGoods,
    ]).then( function( promises ) {

      getStrategicValues.then( strategic_values => { SCMAP.data.uee_strategic_values = JSON.parse( strategic_values ) } );
      getCrimeLevels.then( crimeLevels => { SCMAP.data.crime_levels = JSON.parse( crimeLevels ) } );

      getFactions.then( factions => { Faction.preprocessFactions( JSON.parse( factions ) ) } );
      getGoods.then( goods => { Goods.preprocessGoods( JSON.parse( goods ) ) } );

      getSystems.then( systems => {
        try {
          systems = JSON.parse( systems );
          map.populate( systems );
        } catch( e ) {
          console.error( `Could not populate map:`, e );
          throw e;
        };

        map.scene.add( map.buildReferenceGrid() );

        ui.updateSystemsList();
        renderer.controls.idle();

        map.route().restoreFromSession();
        map.route().update();

        if ( 'selectedSystem' in settings.storage ) {
          let selectedSystem = System.getById( settings.storage.selectedSystem );
          if ( selectedSystem instanceof System ) {
            map.setSelectionTo( selectedSystem );
            selectedSystem.displayInfo( true );
          }
        }

        renderer.controls.throttledEventListener.init( 'change', function () {
          let euler = new THREE.Euler( renderer.camera.userData.phi + Math.PI / 2, renderer.camera.userData.theta, 0, 'YXZ' );
          let rotationMatrix = new THREE.Matrix4().makeRotationFromEuler( euler );
          //map.scene.updateMatrixWorld();

          if ( $('#debug-camera-is-moving') ) {
            $('#debug-camera-is-moving').text( 'Camera is moving' );
          }

          renderer.controls.rememberPosition();

          map.scene.traverse( function ( object ) {
            if ( ( object instanceof THREE.Sprite ) && object.userData.isLabel )
            {
              object.position.copy( object.userData.position.clone().applyMatrix4( rotationMatrix ) );
            }
            else if ( object instanceof THREE.LOD )
            {
              object.update( renderer.camera );
            }
          });
        });

        ui.updateHeight();
      }, failed => {
        console.error( 'Failed to process systems', failed );
      });

    }, ( failure ) => {
      console.error( `Failed loading data:`, failure );
    });

    this.displayState = this.buildDisplayModeFSM( settings.mode );
  }

  getSelected () {
    return this.__currentlySelected;
  }

  selected () {
    return this.getSelected();
  }

  _animate () {
    let rotationY = THREE.Math.degToRad( Date.now() * 0.00025 ) * 300;
    this.scene.traverse( function ( object ) {
      if ( object.userData.isSelector ) {
        object.rotation.y = rotationY;
      }
    });
  }

  setSelected ( system ) {
    if ( system !== null && ! ( system instanceof System ) ) {
      throw new Error( system, 'is not an instance of System' );
    }
    this.__currentlySelected = system;
    if ( system ) {
      settings.storage.selectedSystem = system.id;
    } else {
      delete settings.storage.selectedSystem;
    }
    return system;
  }

  createSelectorObject ( color ) {
    let mesh = new THREE.Mesh( SelectedSystemGeometry, new THREE.MeshBasicMaterial({ color: color }) );
    mesh.scale.set( 4.2, 4.2, 4.2 );
    mesh.visible = false;
    mesh.userData.systemPosition = new THREE.Vector3( 0, 0, 0 );
    mesh.userData.isSelector = true;
    // 2d/3d tween callback
    mesh.userData.scaleY = function ( object, scalar ) {
      let wantedY = object.userData.systemPosition.y * ( scalar / 100 );
      object.translateY( wantedY - object.position.y );
    };
    return mesh;
  }

  __updateSelectorObject ( system ) {
    if ( system instanceof System ) {
      this._selectorObject.visible = true;
      this._selectorObject.userData.systemPosition.copy( system.position );
      //this._selectorObject.position.copy( system.sceneObject.position );
      this.moveSelectorTo( system );
      this.setSelected( system );
    } else {
      this._selectorObject.visible = false;
      this.setSelected( null );
    }
  }

  // Lazy builds the route
  route () {
    if ( !( this._route instanceof Route ) ) {
      this._route = new Route();
      console.log( 'Created new route', this._route.toString() );
    }
    return this._route;
  }

  setSelectionTo ( system ) {
    return this.__updateSelectorObject( system );
  }

  getSystemByName ( name ) {
    return System.getByName( name );
  }

  interactables () {
    return this._interactables;
  }

  deselect () {
    return this.__updateSelectorObject();
  }

  updateSystems () {
    for ( let i = 0; i < allSystems.length; i++ ) {
      allSystems[i].updateSceneObject( this.scene );
    }
  }

  setAllLabelSizes ( vector ) {
    for ( let i = 0; i < allSystems.length; i++ ) {
      allSystems[i].setLabelScale( vector );
    }
  }

  moveSelectorTo ( destination ) {
    let tween, newPosition, position, _this = this, poi, graph, route;
    let tweens = [];

    if ( ! ( _this._selectorObject.visible ) || ! ( _this.getSelected() instanceof System ) ) {
      _this._selectorObject.userData.systemPosition.copy( destination.position );
      _this._selectorObject.position.copy( destination.sceneObject.position );
      _this._selectorObject.visible = true;
      _this.getSelected( destination );
      return;
    }

    newPosition = destination.sceneObject.position.clone();
    graph = new Dijkstra( allSystems, _this.getSelected(), destination );
    graph.buildGraph();

    route = graph.routeArray( destination );
    if ( route.length <= 1 ) {
      _this._selectorObject.userData.systemPosition.copy( destination.position );
      _this._selectorObject.position.copy( destination.sceneObject.position );
      _this._selectorObject.visible = true;
      _this.setSelected( destination );
      return;
    }

    position = {
      x: _this._selectorObject.position.x,
      y: _this._selectorObject.position.y,
      z: _this._selectorObject.position.z
    };

    /* jshint ignore:start */
    for ( let i = 0; i < route.length - 1; i++ ) {
      poi = route[ i + 1 ].system;

      tween = new TWEEN.Tween( position )
        .to( {
          x: poi.sceneObject.position.x,
          y: poi.sceneObject.position.y,
          z: poi.sceneObject.position.z
        }, 800 / ( route.length - 1 ) )
      .easing( TWEEN.Easing.Linear.None )
        .onUpdate( function () {
          _this._selectorObject.position.set( this.x, this.y, this.z );
        } );

      if ( i == 0 ) {
        if ( route.length == 2 ) {
          tween.easing( TWEEN.Easing.Cubic.InOut );
        } else {
          tween.easing( TWEEN.Easing.Cubic.In );
        }
      }

      if ( i > 0 ) {
        tweens[ i - 1 ].chain( tween );
      }

      if ( i == route.length - 2 ) {
        tween.easing( TWEEN.Easing.Cubic.Out );
        tween.onComplete( function() {
          _this._selectorObject.userData.systemPosition.copy( poi.position );
          _this._selectorObject.position.copy( poi.sceneObject.position );
          _this.setSelected( destination );
        } );
      }

      tweens.push( tween );
    }
    /* jshint ignore:end */

    tweens[0].start();
  }

  populate( data ) {
    let systemCount = 0;

    const startTime = new Date();

    SystemList.preprocessSystems( data );

    // First we go through the data to build the basic systems
    allSystems.forEach( system => {
      let sceneObject = system.buildSceneObject();
      this.scene.add( sceneObject );
      this._interactables.push( sceneObject.userData.interactable );
      systemCount++;
      system.sceneObject = sceneObject;
    });

    // Then we go through again and add the routes in a second pass
    allSystems.forEach( system => {
      for ( let i = 0; i < system.jumpPoints.length; i++ ) {
        let jumpPointObject = system.jumpPoints[i].buildSceneObject();
        if ( jumpPointObject instanceof THREE.Object3D ) {
          system._routeObjects.push( jumpPointObject );
          this.scene.add( jumpPointObject );
        }
      }
    });

    const endTime = new Date();

    console.log( `Populating the scene took ${ endTime.getTime() - startTime.getTime() } msec` );

    $('#debug-systems').html( systemCount + ' systems loaded' );

    UI.waitForFontAwesome( () => { this.updateSystems(); } );
  }

  closestPOI ( vector ) {
    let closest = Infinity, _closestPOI, system, length, systemname, xd, zd;

    for ( systemname in SCMAP.data.systems ) {
      system = System.getByName( systemname );
      xd = vector.x - system.position.x;
      zd = vector.z - system.position.z;
      length = Math.sqrt( xd * xd + zd * zd );
      if ( length < closest ) {
        closest = length;
        _closestPOI = system;
      }
    }

    return [ closest, _closestPOI ];
  }

  closestFromArray ( vector, systems ) {
    let closest = Infinity, closestPOI, system, length, systemname, xd, zd;

    for ( let i = 0; i < systems.length; i++ ) {
      system = systems[i];
      xd = vector.x - system.position.x;
      zd = vector.z - system.position.z;
      length = Math.sqrt( xd * xd + zd * zd );
      if ( length < closest ) {
        closest = length;
        closestPOI = system;
      }
    }

    return [ closest, closestPOI ];
  }

  // Get a quick list of systems nearby (within a square)
  withinApproxDistance ( vector, distance ) {
    let systems = [];
    for ( let i = 0; i < allSystems.length; i += 1 ) {
      let system = allSystems[i];
      if ( system.position.x < ( vector.x - distance ) ) { continue; }
      if ( system.position.x > ( vector.x + distance ) ) { continue; }
      if ( system.position.z < ( vector.z - distance ) ) { continue; }
      if ( system.position.z > ( vector.z + distance ) ) { continue; }
      systems.push( system );
    }
    return systems;
  }

  furthestPOI ( vector ) {
    let furthest = 0, _furthestPOI, system, length, systemname, xd, zd;

    for ( systemname in SCMAP.data.systems ) {
      system = System.getByName[ systemname ];
      xd = vector.x - system.position.x;
      zd = vector.z - system.position.z;
      length = Math.sqrt( xd * xd + zd * zd );
      if ( length > furthest ) {
        furthest = length;
        _furthestPOI = system;
      }
    }
    return [ furthest, _furthestPOI ];
  }

  pointAtPlane ( theta, radius, y ) {
    return new THREE.Vector3( radius * Math.cos( theta ), y, -radius * Math.sin( theta ) );
  }

  buildReferenceGrid () {
    let segmentSize = 10, i, j, k, x, z, position;
    let minX = 0, minZ = 0, maxX = 0, maxZ = 0;
    let endTime, startTime;
    let uniqueColours = {};
    let left, right, above, below;
    let vertices, vertexColours;
    let geo = new THREE.BufferGeometry();
    let color;
    let grid = {};
    let alongX = {};

    endTime = startTime = new Date();

    // First we compute rough outer bounds based on all the systems on the map
    // (plus a bit extra because we want to fade to black as well)
    for ( i = 0; i < allSystems.length; i += 1 ) {
      position = allSystems[i].position;
      if ( position.x < minX ) { minX = position.x - (  6 * 10 ); }
      if ( position.x > maxX ) { maxX = position.x + (  8 * 10 ); }
      if ( position.z < minZ ) { minZ = position.z - (  6 * 10 ); }
      if ( position.z > maxZ ) { maxZ = position.z + ( 10 * 10 ); }
    }

    // Now round those numbers to a multiple of segmentSize
    minX = Math.floor( minX / segmentSize ) * segmentSize;
    minZ = Math.floor( minZ / segmentSize ) * segmentSize;
    maxX = Math.floor( maxX / segmentSize ) * segmentSize;
    maxZ = Math.floor( maxZ / segmentSize ) * segmentSize;

    // With the boundaries established, go through each coordinate
    // on the map, and set the colour for each gridpoint on the
    // map with the nearest system's faction being used for that
    // colour. We also take note of each X coordinate visited.
    // There is a bit of room for optimisation left here; the
    // systems could be sorted by a X or Z coordinate, sort of like
    // in an octree, and could possibly be found quicker that way.
    for ( let iz = minZ; iz <= maxZ; iz += segmentSize ) {

      grid[ iz ] = {};

      for ( let ix = minX; ix <= maxX; ix += segmentSize ) {

        alongX[ ix ] = true;

        let vector = new THREE.Vector3( ix, 0, iz );
        let systems = this.withinApproxDistance( vector, 6.5 * segmentSize );

        color = this.colorForVector( vector, systems, segmentSize );

        if ( color !== BLACK )
        {
          grid[ iz ][ ix ] = color.getHexString();
          if ( uniqueColours[ grid[iz][ix] ] === undefined ) {
            uniqueColours[ grid[iz][ix] ] = color;
          }
        }
        else
        {
          grid[ iz ][ ix ] = null;
          uniqueColours[ null ] = BLACK;
        }

      }

    }

    // Now for both X and Z we build a sorted list of each of
    // those coordinates seen, allowing for quick iteration.
    let alongX2 = []; for ( j in alongX ) { alongX2.push( j ); }
    alongX2.sort( function ( a, b ) { return a - b; } );
    alongX = alongX2;

    let alongZ = []; for ( j in grid ) { alongZ.push( j ); }
    alongZ.sort( function ( a, b ) { return a - b; } );

    let positions = [];
    let next_positions_index = 0;
    let colors = [];
    let indices_array = [];

    function addLine( v1, c1, v2, c2 ) {
      if ( next_positions_index >= 0xfffe ) {
        throw new Error('Too many points');
      }

      positions.push( v1[0], v1[1], v1[2] );
      colors.push( c1.r, c1.g, c1.b );
      next_positions_index++;

      positions.push( v2[0], v2[1], v2[2] );
      colors.push( c2.r, c2.g, c2.b );

      indices_array.push( next_positions_index - 1, next_positions_index );

      return next_positions_index++;
    }

    // Now we got most data worked out, and we can start drawing
    // the horizontal lines. We draw a line from start vertex to
    // end vertex for each section where the colour doesn't
    // change. This gives us the fewest number of lines drawn.
    for ( i = 1; i < alongZ.length; i += 1 ) {
      z = alongZ[i];
      vertices = [];
      vertexColours = [];

      for ( j = 1; j < alongX.length; j += 1 ) {
        x = alongX[ j ];
        left = Math.floor( Number( x ) - segmentSize );
        right = Math.floor( Number( x ) + segmentSize );

        const vertexColor = grid[ z ][ x ];

        if ( (vertexColor !== grid[z][left]  && grid[z][left] ) ||
            (vertexColor !== grid[z][right] && grid[z][right])    )
        {
          vertices.push( [ x, 0, z ] );
          vertexColours.push( uniqueColours[ vertexColor ] );
        }
      }

      for ( k = 0; k < vertices.length - 1; k++ ) {
        addLine( vertices[k], vertexColours[k], vertices[k + 1], vertexColours[k + 1] );
      }
    }

    // And do the same for the vertical lines in a separate pass
    for ( i = 1; i < alongX.length; i += 1 ) {
      x = alongX[i];
      vertices = [];
      vertexColours = [];

      for ( j = 1; j < alongZ.length; j += 1 ) {
        z = alongZ[j];
        above = Math.floor( Number( z ) - segmentSize );
        below = Math.floor( Number( z ) + segmentSize );

        const vertexColor = grid[ z ][ x ];

        if ( ( grid[above] && grid[above][x] && vertexColor !== grid[above][x] ) ||
            ( grid[below] && grid[below][x] && vertexColor !== grid[below][x] )    )
        {
          vertices.push( [ x, 0, z ] );
          vertexColours.push( uniqueColours[ vertexColor ] );
        }
      }

      for ( k = 0; k < vertices.length - 1; k++ ) {
        addLine( vertices[k], vertexColours[k], vertices[k + 1], vertexColours[k + 1] );
      }
    }

    // TODO FIXME: current r67 master branch doesn't allow parameters in the constructor, dev branch does ... this code should work for both but needs updating when it is in master
    let indexBA = new THREE.BufferAttribute();
    indexBA.array = new Uint16Array( indices_array );
    indexBA.itemSize = 1;
    geo.addAttribute( 'index', indexBA );

    indexBA = new THREE.BufferAttribute();
    indexBA.array = new Float32Array( positions );
    indexBA.itemSize = 3;
    geo.addAttribute( 'position', indexBA );

    indexBA = new THREE.BufferAttribute();
    indexBA.array = new Float32Array( colors );
    indexBA.itemSize = 3;
    geo.addAttribute( 'color', indexBA );

    geo.dynamic = false;
    geo.computeBoundingBox();

    // Finally create the object with the geometry just built
    let referenceLines = new THREE.Line( geo, new THREE.LineBasicMaterial({
      linewidth: 1.5,
      vertexColors: THREE.VertexColors,
    }), THREE.LinePieces );

    referenceLines.matrixAutoUpdate = false;

    endTime = new Date();
    console.log( 'Building the grid reference plane took ' +
        (endTime.getTime() - startTime.getTime()) + ' msec' );

    return referenceLines;
  }

  colorForVector ( vector, systems, segmentSize ) {
    let color = BLACK;
    let arr = this.closestFromArray( vector, systems );
    if ( arr[0] <= 4.5 * segmentSize && arr[1] ) {
      color = arr[1].faction.planeColor.clone();
      if ( arr[0] >= 4.0 * segmentSize ) {
        color.multiplyScalar( 0.5 );
      } else if ( arr[0] >= 3.0 * segmentSize ) {
        color.multiplyScalar( 0.8 );
      }
    }
    return color;
  }

  buildDisplayModeFSM ( initialState ) {
    let tweenTo2d, tweenTo3d, position, fsm;
    let map = this;

    position = { y: ( initialState === '3d' ) ? 100 : 0.5 };

    tweenTo2d = new TWEEN.Tween( position )
      .to( { y: 0.5 }, 1000 )
      .easing( TWEEN.Easing.Cubic.InOut )
      .onUpdate( function () {
        map.route().removeFromScene(); // TODO: find a way to animate
        for ( let i = 0; i < map.scene.children.length; i++ ) {
          let child = map.scene.children[i];
          if ( typeof child.userData.scaleY === 'function' ) {
            child.userData.scaleY( child, this.y );
          }
        }
      } );

    tweenTo3d = new TWEEN.Tween( position )
      .to( { y: 100.0 }, 1000 )
      .easing( TWEEN.Easing.Cubic.InOut )
      .onUpdate( function () {
        map.route().removeFromScene(); // TODO: find a way to animate
        for ( let i = 0; i < map.scene.children.length; i++ ) {
          let child = map.scene.children[i];
          if ( typeof child.userData.scaleY === 'function' ) {
            child.userData.scaleY( child, this.y );
          }
        }
      } );

    fsm = StateMachine.create({
      initial: initialState || '3d',

      events: [
        { name: 'to2d',  from: '3d', to: '2d' },
        { name: 'to3d', from: '2d', to: '3d' }
      ],

      callbacks: {
        onenter2d: function() {
          $('#sc-map-3d-mode').prop( 'checked', false );
          settings.storage.mode = '2d';
        },

        onenter3d: function() {
          $('#sc-map-3d-mode').prop( 'checked', true );
          settings.storage.mode = '3d';
        },

        onleave2d: function() {
          tweenTo3d.onComplete( function() {
            fsm.transition();
            map.route().update();
          });
          tweenTo3d.start();
          return StateMachine.ASYNC;
        },

        onleave3d: function() {
          tweenTo2d.onComplete( function() {
            fsm.transition();
            map.route().update();
          });
          tweenTo2d.start();
          return StateMachine.ASYNC;
        },
      },

      error: function( eventName, from, to, args, errorCode, errorMessage ) {
        console.log( 'event ' + eventName + ' was naughty : ' + errorMessage );
      }
    });

    return fsm;
  }
}

export default Map;
