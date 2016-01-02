/**
  * @author Lianna Eeftinck / https://github.com/Leeft
  */

import SCMAP from './../scmap';
import StarSystem from './star-system';
import Dijkstra from './dijkstra';
import { hasSessionStorage } from '../helpers/functions';
import { scene, map } from '../starcitizen-webgl-map';
import JumpRouteGeometry from './map/geometry/jump-route-geometry';
import RouteUI from './ui/route';

class Route {
  constructor ( start, waypoints ) {
    this.start = ( start instanceof StarSystem ) ? start : null;
    this.waypoints = [];
    this._graphs = [];
    this._routeObject = undefined;
    this._error = undefined;

    if ( waypoints instanceof StarSystem ) {
      waypoints = [ waypoints ];
    }

    if ( Array.isArray( waypoints ) ) {
      waypoints.forEach( waypoint => {
        if ( waypoint instanceof StarSystem ) {
          this.waypoints.push( waypoint );
        }
      });
    }

    this.__syncGraphs();
  }

  // Find the first matching graph or pair of graphs for the given
  // waypoint. Returns two graphs if the waypoint lies on the end
  // of one and the start of another
  __findGraphs ( system ) {
    let graphs = [];
    let seen = {};

    for ( let i = 0, graphsLength = this._graphs.length; i < graphsLength; i += 1 )
    {
      const graph = this._graphs[ i ];

      let routeArray = [];
      try {
        routeArray = graph.routeArray();
      } catch ( e ) {
        console.error( `Error getting route array: ${ e.message }` );
      }

      if ( graphs.length ) {
        if ( routeArray[0].system.id === system.id ) {
          graphs.push( graph );
          return graphs;
        }
      }

      routeArray.forEach( waypoint => {
        if ( waypoint.system === system && ! ( seen[ waypoint.system.id ] ) ) {
          seen[ waypoint.system.id ] = true;
          graphs.push( graph );
        }
      });
    }

    return graphs;
  }

  splitAt ( waypoint ) {
    const graphs = this.__findGraphs( waypoint );

    if ( graphs.length > 1 ) {
      console.error( `Can't split at '${ waypoint.name }', graphs are already split` );
      return false;
    }

    if ( graphs.length !== 1 ) {
      console.error( `Couldn't find graph for waypoint '${ waypoint.name }'` );
      return false;
    }

    const graph = graphs[0];
    const oldEnd = graph.lastNode().system;

    graph.end = waypoint; // set end of graph to wp

    for ( let i = 0, graphsLength = this._graphs.length; i < graphsLength; i += 1 )
    {
      if ( this._graphs[i] === graph ) {
        // insert new graph at wp, starting at wp, ending at oldEnd
        this._graphs.splice( i + 1, 0, new Dijkstra( SCMAP.allSystems, waypoint, oldEnd ) );

        for ( let j = 0; j < this.waypoints.length; j += 1 ) {
          if ( this.waypoints[j] === oldEnd ) {
            this.waypoints.splice( j, 0, waypoint );
            break;
          }
        }

        this.__syncGraphs();
        this.storeToSession();
        return true;
      }
    }

    console.error( `Couldn't match graph to split` );
  }

  toString () {
    const result = [];

    if ( this.start instanceof StarSystem ) {
      result.push( this.start.toString() );
    }

    this.waypoints.forEach( system => {
      if ( system instanceof StarSystem ) {
        result.push( system );
      }
    });

    return result.join( ' > ' );
  }

  removeWaypoint ( toRemove ) {
    const graphs = this.__findGraphs( toRemove );

    if ( graphs.length !== 2 ) {
      console.error( `Can't remove waypoint '${ toRemove.name }', it is not a waypoint` );
      return false;
    }

    const [ graphOne, graphTwo ] = graphs;

    graphOne.end = graphTwo.start;

    // And now delete graphTwo
    this._graphs.forEach( ( graph, graphIndex ) => {
      if ( graph === graphTwo ) {
        console.log( `Removing`, graphTwo, `at index ${ graphIndex }` );
        // remove the graph
        this._graphs.splice( graphIndex, 1 );

        this.waypoints.forEach( ( waypoint, waypointIndex ) => {
          if ( toRemove === waypoint ) {
            console.log( `Removing`, waypoint, `at index ${ waypointIndex }` );
            // remove the waypoint
            this.waypoints.splice( waypointIndex, 1 );
          }
        });

        this.__syncGraphs();
        this.storeToSession();
        return true;
      }
    });
  }

  moveWaypoint ( waypoint, destination ) {
    if ( waypoint === destination ) {
      return false;
    }

    if ( destination === this.start || this.waypoints.indexOf( destination ) >= 0 ) {
      return false;
    }

    // Easy case, moving start: update start and sync
    if ( waypoint === this.start ) {
      if ( this.waypoints.length !== 1 || destination !== this.waypoints[0] ) {
        this.start = destination;
        this.__syncGraphs();
        this.storeToSession();
        return true;
      } else {
        return false;
      }
    }

    // Slightly more difficult, moving any waypoint: update waypoint and sync
    let index = this.waypoints.indexOf( waypoint );
    if ( index > -1 ) {
      this.waypoints[ index ] = destination;
      this.__syncGraphs();
      this.storeToSession();
      return true;
    }

    // Advanced case: split graphs at waypoint, then update waypoint and sync
    if ( this.splitAt( waypoint ) ) {
      index = this.waypoints.indexOf( waypoint );
      if ( index > -1 ) {
        this.waypoints[ index ] = destination;
        this.__syncGraphs();
        this.storeToSession();
        return true;
      }
    }

    //console.error( `Couldn't find waypoint '${ waypoint.name }'` );
    return false;
  }

  setRoute () {
    const args = Array.prototype.slice.call( arguments );

    this.start = args.shift();
    this.start = ( this.start instanceof StarSystem ) ? this.start : null;
    this.waypoints = [];

    if ( this.start ) {
      args.forEach( system => {
        if ( system instanceof StarSystem ) {
          this.waypoints.push( system );
        }
      });

      this.waypoints = this.waypoints.filter( system => {
        return ( system instanceof StarSystem );
      });
    }

    this.storeToSession();
  }

  // Updates the graphs to match the current waypoints, and recalculates
  // the graphs where needed
  __syncGraphs () {
    const newGraphs = [];

    this._graphs = newGraphs;
    this._error = undefined;

    try {

      for ( let i = 0, waypointsLength = this.waypoints.length; i < waypointsLength; i += 1 )
      {
        const start = ( i === 0 ) ? this.start : this.waypoints[i - 1];
        const end   = this.waypoints[i];
        let graph;

        if ( this._graphs[i] instanceof Dijkstra ) {
          graph = this._graphs[i];
          this._graphs[i].start = start;
          this._graphs[i].end   = end;
        } else {
          graph = new Dijkstra( SCMAP.allSystems, start, end );
        }

        graph.buildGraph( 'time', true );
        newGraphs.push( graph );

        if ( graph.routeArray().length <= 1 ) {
          console.warn( `No route from ${ start.name } to ${ end.name } possible` );
          throw new RouteSegmentFailed( `No route from ${ start.name } to ${ end.name } available` );
          // TODO: could retry with fewer restrictions to indicate the user can change things
          // to make the route possible, and indicate so in the error message
        }

      }

      this._graphs = newGraphs;
      //if ( newGraphs.length > 0 ) {
      //  console.log( `Synced and built ${ newGraphs.length } graphs` );
      //}
    }
    catch ( e )
    {
      this._error = e;
      if ( !( e instanceof RouteSegmentFailed ) ) {
        console.error( `Error building route: ${ e.message }` );
      }
    }
  }

  lastError () {
    return this._error;
  }

  isSet () {
    return this.currentRoute().length > 1;
  }

  currentRoute () {
    const route = [];

    for ( let i = 0, graphsLength = this._graphs.length; i < graphsLength; i += 1 ) {
      // TODO: Check whether this is correct or not, looks kaput
      if ( this.waypoints[i] instanceof StarSystem ) {
        this._graphs[i].rebuildGraph();
        let routePart = this._graphs[i].routeArray( this.waypoints[i] );
        for ( let j = 0; j < routePart.length; j += 1 ) {
          route.push( routePart[j] );
        }
      }
    }

    return route;
  }

  // Returns a float 0.0 to 1.0 to indicate where we are in
  // the route; we can use this to establish the approximate
  // colour of the given point
  alphaOfSystem ( system ) {
    const currentStep = this.indexOfCurrentRoute( system );

    if ( currentStep ) {
      return ( currentStep / this.currentRoute().length );
    }

    return 0;
  }

  indexOfCurrentRoute ( system ) {
    if ( ! system instanceof StarSystem ) {
      return;
    }

    let currentStep = 0;

    this.currentRoute().forEach( ( waypoint, index ) => {
      if ( waypoint.system === system ) {
        currentStep = index;
      }
    });

    return currentStep;
  }

  rebuildCurrentRoute () {
    this.removeFromScene();
    this._graphs.forEach( graph => {
      if ( graph.rebuildGraph() ) {
        let destination = graph.destination();
        if ( destination ) {
          //console.log( `Have existing destination, updating route` );
          this.update( destination );
        }
      }
    });
  }

  destroy () {
    this.start = null;
    this.waypoints = [];
    this.update();
  }

  removeFromScene () {
    if ( this._routeObject ) {
      scene.remove( this._routeObject );
    }
  }

  update () {
    const before = this.toString();

    this.__syncGraphs();
    this.removeFromScene();

    const entireRoute = this.currentRoute();

    if ( entireRoute.length )
    {
      // Exception can be thrown and caught to signal the route isn't possible
      if ( this.lastError() ) {
        return;
      }

      // Build all the parts of the route together in a single geometry group
      const routeObject = new JumpRouteGeometry({
        map: map,
        route: this,
        initialScale: map.displayState.currentScale,
      });
      this._routeObject = routeObject.mesh;
      scene.add( routeObject.mesh );
    }

    RouteUI.update( this );
  }

  storeToSession () {
    if ( hasSessionStorage ) {
      if ( this.start && ( this.waypoints.length ) ) {
        window.sessionStorage.currentRoute = JSON.stringify({
          start: this.start.id,
          waypoints: this.waypoints.map( waypoint => {
            return waypoint.id;
          })
        });
      } else {
        delete window.sessionStorage.currentRoute;
      }
    }
  }

  restoreFromSession () {
    if ( hasSessionStorage && ( 'currentRoute' in window.sessionStorage ) ) {
      const data = JSON.parse( window.sessionStorage.currentRoute );
      this.start = StarSystem.getById( data.start );
      this.waypoints = data.waypoints.map( waypoint => {
        return StarSystem.getById( waypoint );
      });
    }
  }
}

function RouteSegmentFailed( message ) {
  this.message = message;
  this.name = 'RouteSegmentFailed';
}
RouteSegmentFailed.prototype = new Error();
RouteSegmentFailed.prototype.constructor = RouteSegmentFailed;

export default Route;
