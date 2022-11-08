/* -- BEGIN LICENSE BLOCK ----------------------------------------------
  (c) Copyright 2018 FZI Forschungszentrum Informatik, Karlsruhe, Germany

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
  IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
  FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
  CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
  DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
  DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
  WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY
  WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
-- END LICENSE BLOCK ------------------------------------------------*/
import * as PIXI from 'pixi.js';
import { JPath } from 'src/app/services/data.service';
import {GraphBuilder, DijkstraStrategy} from "js-shortest-path"
import { Bezier} from "bezier-js/dist/bezier.js";
import { Vector2 } from 'three';

export function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}

export function trimAngle(angle){
  return  angle < 0 ? 360 + angle  :  (angle > 360 ? angle - 360 :angle)
}

export function getAngle(A,B,C){  
  var AB = Math.sqrt(Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2));
  var BC = Math.sqrt(Math.pow(B.x - C.x, 2) + Math.pow(B.y - C.y, 2));
  var AC = Math.sqrt(Math.pow(C.x - A.x, 2) + Math.pow(C.y - A.y, 2));
  return Math.acos((BC * BC + AB * AB - AC * AC) / (2 * BC * AB)) * 180 / Math.PI;
}

export function getOrientation(origin : PIXI.Point , obj :  PIXI.Point) : 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW' {
  let angle = getAngle(new PIXI.Point (origin.x , 0) , origin , obj)
  angle = obj.x > origin.x ? angle : 360 - angle
  return getOrientationByAngle(angle)
}

export function getOrientationByAngle(angle) : 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW' {
  if(angle > 337.5 || angle <= 22.5) return 'N'
  if(angle > 22.5 &&  angle <= 67.5) return 'NE'
  if(angle > 67.5 &&  angle <= 112.5) return 'E'
  if(angle > 112.5 &&  angle <= 157.5) return 'SE'
  if(angle > 157.5 &&  angle <= 202.5) return 'S'
  if(angle > 202.5 &&  angle <= 247.5) return 'SW'
  if(angle > 247.5 &&  angle <= 292.5) return 'W'
  if(angle > 292.5 &&  angle <= 337.5) return 'NW'
}

export function getBezierSectionPoints(vertices: PIXI.Point[], ctrlPts: PIXI.Point[], t0, t1) {
  const x1 = vertices[0].x
  const y1 = vertices[0].y
  const x2 = vertices[1].x
  const y2 = vertices[1].y
  const bx1 = ctrlPts[0].x
  const by1 = ctrlPts[0].y
  const bx2 = ctrlPts[1].x
  const by2 = ctrlPts[1].y
  let u0 = 1.0 - t0
  let u1 = 1.0 - t1
  let qxa = x1 * u0 * u0 + bx1 * 2 * t0 * u0 + bx2 * t0 * t0
  let qxb = x1 * u1 * u1 + bx1 * 2 * t1 * u1 + bx2 * t1 * t1
  let qxc = bx1 * u0 * u0 + bx2 * 2 * t0 * u0 + x2 * t0 * t0
  let qxd = bx1 * u1 * u1 + bx2 * 2 * t1 * u1 + x2 * t1 * t1

  let qya = y1 * u0 * u0 + by1 * 2 * t0 * u0 + by2 * t0 * t0
  let qyb = y1 * u1 * u1 + by1 * 2 * t1 * u1 + by2 * t1 * t1
  let qyc = by1 * u0 * u0 + by2 * 2 * t0 * u0 + y2 * t0 * t0
  let qyd = by1 * u1 * u1 + by2 * 2 * t1 * u1 + y2 * t1 * t1

  let xa = qxa * u0 + qxc * t0
  let xb = qxa * u1 + qxc * t1
  let xc = qxb * u0 + qxd * t0
  let xd = qxb * u1 + qxd * t1

  let ya = qya * u0 + qyc * t0
  let yb = qya * u1 + qyc * t1
  let yc = qyb * u0 + qyd * t0
  let yd = qyb * u1 + qyd * t1
  return { xa: xa, ya: ya, xb: xb, yb: yb, xc: xc, yc: yc, xd: xd, yd: yd }
}

 export function intersectionsOfCircles(c1, c2) {
   /**
 * @description Get information about the intersection points of a circle.
 * Adapted from: https://stackoverflow.com/a/12221389/5553768.
 * @param {Object} c1 An object describing the first circle.
 * @param {float} c1.x The x coordinate of the circle.
 * @param {float} c1.y The y coordinate of the circle.
 * @param {float} c1.r The radius of the circle.
 * @param {Object} c2 An object describing the second circle.
 * @param {float} c2.x The x coordinate of the circle.
 * @param {float} c2.y The y coordinate of the circle.
 * @param {float} c2.r The radius of the circle.
 * @returns {Object} Data about the intersections of the circles.
 * intersection(
    {x: 1, y: 1, r: 2},
    {x: 0, y: -1, r: 1}
)

// Result
result = {
    intersect_count: 2,
    intersect_occurs: true,
    one_is_in_other: false,
    are_equal: false,
    point_1: { x: 1, y: -1 },
    point_2: { x: -0.6, y: -0.2 },
}
 * 
 */
  // Start constructing the response object.
  const result = {
      intersect_count: 0,
      intersect_occurs: true,
      one_is_in_other: false,
      are_equal: false,
      point_1: { x: null, y: null },
      point_2: { x: null, y: null },
  };

  // Get vertical and horizontal distances between circles.
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;

  // Calculate the distance between the circle centers as a straight line.
  const dist = Math.hypot(dy, dx);

  // Check if circles intersect.
  if (dist > c1.r + c2.r) {
      result.intersect_occurs = false;
  }

  // Check one circle isn't inside the other.
  if (dist < Math.abs(c1.r - c2.r)) {
      result.intersect_occurs = false;
      result.one_is_in_other = true;
  }

  // Check if circles are the same.
  if (c1.x === c2.x && c1.y === c2.y && c1.r === c2.r) {
      result.are_equal = true;
      result.are_equal = true;
  }

  // Find the intersection points
  if (result.intersect_occurs) {
      // Centroid is the pt where two lines cross. A line between the circle centers
      // and a line between the intersection points.
      const centroid = (c1.r * c1.r - c2.r * c2.r + dist * dist) / (2.0 * dist);

      // Get the coordinates of centroid.
      const x2 = c1.x + (dx * centroid) / dist;
      const y2 = c1.y + (dy * centroid) / dist;

      // Get the distance from centroid to the intersection points.
      const h = Math.sqrt(c1.r * c1.r - centroid * centroid);

      // Get the x and y dist of the intersection points from centroid.
      const rx = -dy * (h / dist);
      const ry = dx * (h / dist);

      // Get the intersection points.
      result.point_1.x = Number((x2 + rx).toFixed(15));
      result.point_1.y = Number((y2 + ry).toFixed(15));

      result.point_2.x = Number((x2 - rx).toFixed(15));
      result.point_2.y = Number((y2 - ry).toFixed(15));

      // Add intersection count to results
      if (result.are_equal) {
          result.intersect_count = null;
      } else if (result.point_1.x === result.point_2.x && result.point_1.y === result.point_2.y) {
          result.intersect_count = 1;
      } else {
          result.intersect_count = 2;
      }
  }
  return result;
}

export function getDijkstraGraph(paths : JPath[]) : {paths : JPath[] , graph : any } {
  const graphBuilder = GraphBuilder()
  paths.forEach(p=> graphBuilder.edge(p.sourcePointCode , p.destinationPointCode , p.length))
  return { paths : JSON.parse(JSON.stringify(paths)), graph :  DijkstraStrategy(graphBuilder.build())} 
}

export function getLength(isCurved: boolean, vertices : {x : number, y : number}[]) {
  if (isCurved) {
    return new Bezier(vertices[0].x, vertices[0].y, vertices[3].x, vertices[3].y, vertices[1].x, vertices[1].y, vertices[2].x, vertices[2].y).length()
  } else {
    return Math.hypot(vertices[0].x - vertices[3].x, vertices[0].y - vertices[3].y)
  }
}


export function inside(point, vertices) {
  // ray-casting algorithm based on
  // https://wrf.ecse.rpi.edu/Research/Short_Notes/pnpoly.html/pnpoly.html
  
  var x = point['x'], y = point['y'];
  
  var inside = false;
  for (var i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      var xi = vertices[i]['x'], yi = vertices[i]['y'];
      var xj = vertices[j]['x'], yj = vertices[j]['y'];
      
      var intersect = ((yi > y) != (yj > y))
          && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
  }
  
  return inside;
};

export function centroidOfPolygon(vertices : {x : number , y : number}[])
{
    var minX, maxX, minY, maxY;
    for (var i = 0; i < vertices.length; i++)
    {
        minX = (vertices[i].x < minX || minX == null) ? vertices[i].x : minX;
        maxX = (vertices[i].x > maxX || maxX == null) ? vertices[i].x : maxX;
        minY = (vertices[i].y < minY || minY == null) ? vertices[i].y : minY;
        maxY = (vertices[i].y > maxY || maxY == null) ? vertices[i].y : maxY;
    }
    return {x : (minX + maxX) / 2,  y: (minY + maxY) / 2};
}



export function getBorderVertices(vertices: { x: number, y: number }[] , thickness : number = 5) :  { x: number, y: number }[]{
  let ret = []
  for (let i = 0; i < vertices.length; i++) {
    let previousVertex = i == 0 ? vertices[vertices.length - 1] : vertices[i - 1];
    let currentVertex = vertices[i];
    let nextVertex = i == vertices.length - 1 ? vertices[0] : vertices[i + 1];

    var pt1 = getBorderVertex(new Vector2(previousVertex.x , previousVertex.y), new Vector2(currentVertex.x , currentVertex.y), new Vector2(nextVertex.x , nextVertex.y), thickness);
    var pt2 = getBorderVertex(new Vector2(previousVertex.x , previousVertex.y), new Vector2(currentVertex.x , currentVertex.y), new Vector2(nextVertex.x , nextVertex.y), -1 * thickness);
    ret[i] = inside(pt1 , vertices) ? pt1 : pt2
  }
  return ret
}

// function isConvex(previousVertex : Vector2,  currentVertex : Vector2,  nextVertex : Vector2) : boolean{
//   return (
//       previousVertex.x * (nextVertex.y - currentVertex.y) +
//       currentVertex.x * (previousVertex.y - nextVertex.y) +
//       nextVertex.x * (currentVertex.y - previousVertex.y)
//   ) < 0;
// }

function getBorderVertex( previousVertex : Vector2,  currentVertex : Vector2, nextVertex : Vector2, thicknes : number) : Vector2 {
  //I'm using the word "vector" here to distinguish numbers which are directions, 
  //whereas "vertex" refers to a point. Mathematically, there's no difference.
  let line1 = new Vector2(currentVertex.x - previousVertex.x, currentVertex.y - previousVertex.y);
  //normalize == make the length equal to 1
  line1.normalize();
  let line2 = new Vector2(currentVertex.x - nextVertex.x, currentVertex.y - nextVertex.y);
  line2.normalize();

  //We really shouldn't have joints that are just straight lines 
  //(especially because floating point numbers are imprecise), 
  //but we want the formula to be generic enough to handle this edge case (pun intended)

  //The Dot Product is the same as the dot product algorithm you learned in primary school geometry.
  let dotProduct = line1.dot(line2);
  if(dotProduct == 1 || dotProduct == -1) {
      let normalVector = new Vector2(line1.y * thicknes , -line1.x * thicknes) ;
      normalVector = normalVector.multiplyScalar(thicknes);
      return new Vector2(currentVertex.x + normalVector.x, currentVertex.y + normalVector.y);
  }

  let halfwayLine = line1.add(line2) ;
  //We want the algorithm to work correctly regardless of whether it's a concave joint 
  //or a convex joint. If it's concave, we need to reverse the direction.
  // if(!isConvex(previousVertex, currentVertex, nextVertex)){
  //   halfwayLine = halfwayLine.multiplyScalar(-1);
  // }

  halfwayLine.normalize();
  halfwayLine = halfwayLine.multiplyScalar(thicknes);
  return new Vector2(currentVertex.x + halfwayLine.x, currentVertex.y + halfwayLine.y);
}