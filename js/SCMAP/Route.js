/**
  * @author Lianna Eeftinck / https://github.com/Leeft
  */

SCMAP.Route = function ( start, waypoints ) {
   this.start = ( start instanceof SCMAP.System ) ? start : null;
   this.waypoints = [];

   this._graphs = [];
   this._routeObject = undefined;

   this._error = undefined;

   if ( waypoints instanceof SCMAP.System ) {
      this.waypoints = [ waypoints ];
   } else if ( Array.isArray( waypoints ) ) {
      for ( var i = 0; i < waypoints.length; i += 1 ) {
         if ( waypoints[i] instanceof SCMAP.System ) {
            this.waypoints.push( waypoints[i] );
         }
      }
   }

   this.__syncGraphs();
};

SCMAP.Route.prototype = {
   constructor: SCMAP.Route,

   // Find the first matching graph or pair of graphs for the given
   // waypoint. Returns two graphs if the waypoint lies on the end
   // of one and the start of another
   __findGraphs: function __findGraphs( waypoint ) {
      var graphs = [];
      var seen = {};

      for ( var i = 0; i < this._graphs.length; i += 1 )
      {
         var route = [];
         try {
            route = this._graphs[i].routeArray();
         } catch ( e ) {
            console.error( "Error getting route array: "+e.message );
         }

         if ( graphs.length ) {
            if ( route[0].system.id === waypoint.id ) {
               graphs.push( this._graphs[i] );
               return graphs;
            }
         }

         for ( var j = 0; j < route.length; j += 1 ) {
            if ( route[j].system === waypoint && !(seen[ route[j].system.id ]) ) {
               seen[ route[j].system.id ] = true;
               graphs.push( this._graphs[i] );
            }
         }
      }

      return graphs;
   },

   splitAt: function splitAt( waypoint ) {
      var graphs = this.__findGraphs( waypoint );
      if ( graphs.length > 1 ) {
         console.error( "Can't split at '"+waypoint.name+"', graphs are already split" );
         return false;
      }
      if ( graphs.length !== 1 ) {
         console.error( "Couldn't find graph for waypoint '"+waypoint.name+"'" );
         return false;
      }
      var graph = graphs[0];
      var routeArray = graph.routeArray();
      var oldEnd = graph.lastNode().system;
      graph.end = waypoint; // set end of graph to wp
      for ( var i = 0; i < this._graphs.length; i += 1 ) {
         if ( this._graphs[i] === graph ) {
            // insert new graph at wp, starting at wp, ending at oldEnd
            this._graphs.splice( i + 1, 0, new SCMAP.Dijkstra( SCMAP.System.List, waypoint, oldEnd ) );
            for ( var j = 0; j < this.waypoints.length; j += 1 ) {
               if ( this.waypoints[j] === oldEnd ) {
                  this.waypoints.splice( j, 0, waypoint );
                  break;
               }
            }
            this.__syncGraphs();
            return true;
         }
      }
      console.error( "Couldn't match graph to split" );
   },

   toString: function toString() {
      var result = [];
      if ( this.start instanceof SCMAP.System ) {
         result.push( this.start.toString() );
      }
      $.each( this.waypoints, function( index, value ) {
         if ( value instanceof SCMAP.System ) {
            result.push( value );
         }
      });
      return result.join( ' > ' );
   },

   removeWaypoint: function removeWaypoint( waypoint ) {
      var graphs = this.__findGraphs( waypoint );
      if ( graphs.length !== 2 ) {
         console.error( "Can't remove waypoint '"+waypoint.name+"', it is not a waypoint" );
         return false;
      }
      var graphOne = graphs[0];
      var graphTwo = graphs[1];
      graphOne.end = graphTwo.start;
      // And now delete graphTwo
      for ( var i = 0; i < this._graphs.length; i += 1 ) {
         if ( this._graphs[i] === graphTwo ) {
            console.log( "Matched "+graphTwo+" starting at index "+i );
            console.log( this._graphs );
            // remove the graph
            this._graphs.splice( i, 1 );
            console.log( this._graphs );
            for ( var j = 0; j < this.waypoints.length; j += 1 ) {
               if ( this.waypoints[j] === waypoint ) {
                  console.log( "Matched "+waypoint+" at index "+j );
                  console.log( this.waypoints );
                  this.waypoints.splice( j, 1 );
                  console.log( this.waypoints );
                  break;
               }
            }
            this.__syncGraphs();
            return true;
         }
      }
   },

   moveWaypoint: function moveWaypoint( waypoint, destination ) {
      var index;

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
            return true;
         } else {
            return false;
         }
      }

      // Slightly more difficult, moving any waypoint: update waypoint and sync
      index = this.waypoints.indexOf( waypoint );
      if ( index > -1 ) {
         this.waypoints[ index ] = destination;
         this.__syncGraphs();
         return true;
      }

      // Advanced case: split graphs at waypoint, then update waypoint and sync
      if ( this.splitAt( waypoint ) ) {
         index = this.waypoints.indexOf( waypoint );
         if ( index > -1 ) {
            this.waypoints[ index ] = destination;
            this.__syncGraphs();
            return true;
         }
      }

      //console.error( "Couldn't find waypoint '"+waypoint.name+"'" );
      return false;
   },

   setRoute: function setRoute() {
      var args = Array.prototype.slice.call( arguments );
      var i;
      this.start = args.shift();
      this.start = ( this.start instanceof SCMAP.System ) ? this.start : null;
      this.waypoints = [];
      if ( this.start ) {
         for ( i = 0; i < args.length; i += 1 ) {
            if ( args[i] instanceof SCMAP.System ) {
               this.waypoints.push( args[i] );
            }
         }

         for ( i = 0; i < this.waypoints.length; i += 1 ) {
            this.waypoints[i] = ( this.waypoints[i] instanceof SCMAP.System ) ? this.waypoints[i] : null;
         }
      }
   },

   // Updates the graphs to match the current waypoints, and recalculates
   // the graphs where needed
   __syncGraphs: function __syncGraphs() {
      var newGraphs = [];
      this._graphs = newGraphs;
      this._error = undefined;

      try {

         for ( var i = 0; i < this.waypoints.length; i += 1 )
         {
            var start = ( i === 0 ) ? this.start : this.waypoints[i - 1];
            var end   = this.waypoints[i];
            var graph;
            if ( this._graphs[i] instanceof SCMAP.Dijkstra ) {
               graph = this._graphs[i];
               this._graphs[i].start = start;
               this._graphs[i].end   = end;
            } else {
               graph = new SCMAP.Dijkstra( SCMAP.System.List, start, end );
            }

            graph.buildGraph( 'time', true );
            newGraphs.push( graph );

            var routeSegment = graph.routeArray();

            if ( routeSegment.length <= 1 ) {
               console.warn( "No route from "+start.name+" to "+end.name+" possible" );
               throw new RouteSegmentFailed( "No route from "+start.name+" to "+end.name+" available" );
               // TODO: could retry with fewer restrictions to indicate the user can change things
               // to make the route possible, and indicate so in the error message
            }

         }

         this._graphs = newGraphs;
         if ( newGraphs.length > 0 ) {
            console.log( "Synced and built "+newGraphs.length+" graphs" );
         }
      }
      catch ( e )
      {
         this._error = e;
         if ( !( e instanceof RouteSegmentFailed ) ) {
            console.error( "Error building route: " + e.message );
         }
      }
   },

   lastError: function lastError() {
      return this._error;
   },

   isSet: function isSet() {
      var route = this.currentRoute();
      return route.length > 1;
   },

   currentRoute: function currentRoute() {
      var route = [];
      for ( var i = 0; i < this._graphs.length; i += 1 ) {
         if ( this.waypoints[i] instanceof SCMAP.System ) {
            this._graphs[i].rebuildGraph();
            var routePart = this._graphs[i].routeArray( this.waypoints[i] );
            for ( var j = 0; j < routePart.length; j += 1 ) {
               route.push( routePart[j] );
            }
         }
      }
      return route;
   },

   // Returns a float 0.0 to 1.0 to indicate where we are in
   // the route; we can use this to establish the approximate
   // colour of the given point
   alphaOfSystem: function alphaOfSystem( system ) {
      if ( ! system instanceof SCMAP.System ) {
         return 0;
      }

      var currentStep = 0;
      var currentRoute = this.currentRoute();

      if ( currentRoute.length ) {
         for ( var i = 0; i < currentRoute.length; i++ ) {
            if ( currentRoute[i].system === system ) {
               currentStep = i;
               break;
            }
         }
      }

      if ( currentStep ) {
         return( currentStep / currentRoute.length );
      }

      return 0;
   },

   indexOfCurrentRoute: function indexOfCurrentRoute( system ) {
      if ( ! system instanceof SCMAP.System ) {
         return;
      }

      var currentStep;
      var currentRoute = this.currentRoute();

      if ( currentRoute.length ) {
         for ( var i = 0; i < currentRoute.length; i++ ) {
            if ( currentRoute[i].system === system ) {
               currentStep = i;
               break;
            }
         }
      }

      return currentStep;
   },

   rebuildCurrentRoute: function rebuildCurrentRoute() {
      this.removeFromScene();
      for ( var i = 0; i < this._graphs.length; i++ ) {
         if ( this._graphs[i].rebuildGraph() ) {
            var destination = this._graphs[i].destination();
            if ( destination ) {
               console.log( "Have existing destination, updating route" );
               this.update( destination );
            }
         }
      }
   },

   destroy: function destroy() {
      this.start = null;
      this.waypoints = [];
      this.update();
   },

   removeFromScene: function removeFromScene() {
      if ( this._routeObject ) {
         scene.remove( this._routeObject );
      }
      $('#routelist').empty();
   },

   update: function update( destination ) {
      var _this = this, i, route, material, system, $entry;
      var duration = 0, totalDuration = 0;
      var before = this.toString();

      this.__syncGraphs();

      if ( !( destination instanceof SCMAP.System ) ) {
         var numWaypoints = this.waypoints.length;
         destination = this.waypoints[numWaypoints-1];
      }

      this.removeFromScene();

      if ( this.lastError() ) {
         $('#routelist').html(
            '<p class="impossible">'+this.lastError().message+'</p>'
         );
         $('#map_ui').tabs( 'option', 'active', 3 );
         return;
      }

      this._routeObject = new THREE.Object3D();

      //console.log( "Route updated: " + this.toString() ); // TODO remove

      // building all the parts of the route together in a single geometry group
      var entireRoute = this.currentRoute();
      var startColour = new THREE.Color( 0xEEEE66 );
      var endColour   = new THREE.Color( 0xFF3322 ); //new THREE.Color( 0xDD3322 );

      for ( i = 0; i < ( entireRoute.length - 1 ); i += 1 ) {
         var from = entireRoute[i].system;
         var to = entireRoute[i+1].system;
         var geometry = this.createRouteGeometry( from, to );
         if ( geometry ) {
               
            material = new THREE.MeshBasicMaterial( { color: startColour.clone().lerp( endColour, this.alphaOfSystem( to ) ) } );

            var mesh = new THREE.Mesh( geometry, material );
            mesh.position = from.sceneObject.position.clone();
            mesh.lookAt( to.sceneObject.position );
            this._routeObject.add( mesh );
         }
      }

      if ( entireRoute.length === 0 )
      {
         $('#routelist').append(
            '<p class="no-route">No route set.</p>'
         );
         return;
      }

      if ( typeof this.start.sceneObject === 'object' )
      {
         var waypointObject = window.map.createSelectorObject( startColour );
         waypointObject.scale.set( 3.8, 3.8, 3.8 );
         waypointObject.position.copy( this.start.sceneObject.position );
         waypointObject.visible = true;
         this._routeObject.add( waypointObject );

         for ( i = 0; i < this.waypoints.length; i += 1 ) {
            if ( typeof this.waypoints[i].sceneObject === 'object' ) {
               //var selectorColour = 0xDD8844;
               //if ( i === this.waypoints.length - 1 ) {
               //   selectorColour = 0xDD3322;
               //}
               waypointObject = window.map.createSelectorObject( startColour.clone().lerp( endColour, this.alphaOfSystem( this.waypoints[i] ) ) );
               waypointObject.scale.set( 3.8, 3.8, 3.8 );
               waypointObject.position.copy( this.waypoints[i].sceneObject.position );
               waypointObject.visible = true;
               this._routeObject.add( waypointObject );
            }
         }

         scene.add( this._routeObject );
      }

      $('#routelist').empty();

      if ( entireRoute.length > 1 )
      {
         $('#routelist')
            .append( '<table class="routelist"><thead></thead><tbody></tbody></table>' );

         $('#routelist table')
            .append( '<caption>'+
               'Route from '+
               entireRoute[0].system.createInfoLink( true ).outerHtml()+' to ' +
               entireRoute[entireRoute.length-1].system.createInfoLink( true ).outerHtml() +
               ' along <strong class="route-count">' +
               '</strong> jump points:</caption>' );

         var routeCount = 0;

         for ( i = 0; i < entireRoute.length; i += 1 )
         {
            system = entireRoute[i].system;

            if ( i > 0 && system.id === entireRoute[i-1].system.id ) {
               $('#routelist tr').last().addClass('waypoint').find('td.control i')
                  .addClass('fa-lg').addClass('fa-times').addClass('text-danger')
                  .removeClass('fa-long-arrow-down').prop('title','Remove waypoint')
                  .wrap('<a href="#" class="remove-waypoint" data-system="'+system.id+'"></a>');

               continue;
            }

            routeCount += 1;
            duration = 30 * 60;
            $entry = $(
               '<tr class="waypoint">'+
                  '<th class="count muted">'+routeCount+'</th>'+
                  '<td class="control muted"></td>'+ //<a class="remove-waypoint" href="#"><i class="fa fa-fw fa-lg"></i></a></td>'+
                  '<td class="system">'+system.createInfoLink( false, true ).outerHtml()+'</td>'+
                  '<td class="duration muted small"></td>'+
               '</tr>'
            );

            if ( i === 0 ) {

               duration = 30 * 60 / 2; // TODO
               $entry.addClass('start').find('td.control').html('<i class="fa fa-fw fa-lg fa-flag" title="Start"></i>');

            } else if ( i === ( entireRoute.length - 1 ) ) {

               duration = 30 * 60 / 2; // TODO
               $entry.addClass('end').find('td.control').html('<i class="fa fa-fw fa-lg fa-flag-checkered" title="Destination"></i>');

            } else {

               $entry.find('td.control').html('<i class="fa fa-fw fa-lg fa-long-arrow-down" title="Destination"></i>');
            }

            $entry.find('td.duration').html( '&plusmn;' + duration.toHMM() );

            totalDuration += duration;
            $('#routelist tbody').append( $entry );
         }

         $('#routelist table').append(
            '<tfoot>'+
               '<tr>'+
                  '<th class="count">&nbsp;</th>'+
                  '<th class="control">&nbsp;</th>'+
                  '<th class="system">&nbsp;</th>'+
                  '<th class="duration small">&plusmn;'+totalDuration.toHMM()+'</th>'+
               '</tr>'+
            '</tfoot>'
         );

         $('#routelist .route-count').text( routeCount - 1 );

         $('#routelist').append(
            '<p><button class="delete-route" id="delete-route"><i class="fa fa-fw fa-trash-o"></i>Delete route</button></p>'
         );
      }
      else
      {
         $('#routelist').append(
            '<p class="impossible">No route available'+
            ' with your current settings</p>'
         );
      }

      if ( this.toString() !== before ) {
         $('#map_ui').data( 'jsp' ).reinitialise();
         $('#map_ui').tabs( 'option', 'active', 3 );
      }
   },

   createRouteGeometry: function createRouteGeometry( source, destination ) {
      if ( !source.sceneObject ) { return; }
      if ( !destination.sceneObject ) { return; }
      var distance = source.sceneObject.position.distanceTo( destination.sceneObject.position );
      var geometry = new THREE.CylinderGeometry( 0.6, 0.6, distance, 8, 1, true );
      geometry.applyMatrix( new THREE.Matrix4().makeTranslation( 0, distance / 2, 0 ) );
      geometry.applyMatrix( new THREE.Matrix4().makeRotationX( THREE.Math.degToRad( 90 ) ) );
      return geometry;
   }
};

function RouteSegmentFailed( message ) {
   this.message = message;
   this.name = 'RouteSegmentFailed';
}
RouteSegmentFailed.prototype = new Error();
RouteSegmentFailed.prototype.constructor = RouteSegmentFailed;


// EOF
