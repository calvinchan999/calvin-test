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


export function quaternionToAngleDeg(x: number, y: number, z: number, w: number) {
    // Stolen from Ros2D-JS :)
    const q0 = w;
    const q1 = x;
    const q2 = y;
    const q3 = z;

    const q2sqr = q2 * q2;
    const t0 = -2.0 * (q2sqr + q3 * q3) + 1.0;
    const t1 = +2.0 * (q1 * q2 + q0 * q3);
    let t2 = -2.0 * (q1 * q3 - q0 * q2);
    // const t3 = +2.0 * (q2 * q3 + q0 * q1);
    // const t4 = -2.0 * (q1 * q1 + q2sqr) + 1.0;

    t2 = t2 > 1.0 ? 1.0 : t2;
    t2 = t2 < -1.0 ? -1.0 : t2;
    const yaw = Math.atan2(t1, t0);
    return yaw * (180 / Math.PI) + 360;
}

export function quaternionToYawRotation(x: number, y: number, z: number, w: number) {
    // Stolen from Ros2D-JS :)
    const q0 = w;
    const q1 = x;
    const q2 = y;
    const q3 = z;

    const q2sqr = q2 * q2;
    const t0 = -2.0 * (q2sqr + q3 * q3) + 1.0;
    const t1 = +2.0 * (q1 * q2 + q0 * q3);
    let t2 = -2.0 * (q1 * q3 - q0 * q2);
    t2 = t2 > 1.0 ? 1.0 : t2;
    t2 = t2 < -1.0 ? -1.0 : t2;
    return Math.atan2(t1, t0);
}

export function toQuaternion(yaw: number, pitch: number, roll: number) {
    const cy = Math.cos(yaw / 2);
    const sy = Math.sin(yaw / 2);
    const cp = Math.cos(pitch / 2);
    const sp = Math.sin(pitch / 2);
    const cr = Math.cos(roll / 2);
    const sr = Math.sin(roll / 2);
    const w = cy * cp * cr + sy * sp * sr;
    const x = cy * cp * sr - sy * sp * cr;
    const y = sy * cp * sr + cy * sp * cr;
    const z = sy * cp * cr - cy * sp * sr;
    return { x: x, y: y, z: z, w: w };

}

export function rosQuaternionToYaw(x: number, y: number, z: number, w: number) {
    const q0 = w;
    const q1 = x;
    const q2 = y;
    const q3 = z;
    // Canvas rotation is clock wise and in degrees
    return -Math.atan2(2 * (q0 * q3 + q1 * q2), 1 - 2 * (q2 * q2 + q3 * q3));
}

export function yawToRosQuaternion(yaw: number) {
    const angle = -yaw;
    const x = 0;
    const y = 0;
    const z = Math.sin(angle / 2);
    const w = Math.cos(angle / 2);
    return { x: x, y: y, z: z, w: w };
}

export function angleDegToQuaternion(angleDeg: number) {
    const x = 0;
    const y = 0;
    const z = Math.sin(angleDeg / 2);
    const w = Math.cos(angleDeg / 2);
    return { x: x, y: y, z: z, w: w };
}

export function yawRotationToQuaternion(yaw: number) {
    const x = 0;
    const y = 0;
    const z = Math.sin(yaw / 2);
    const w = Math.cos(yaw / 2);
    return { x: x, y: y, z: z, w: w };
}

export function directionToAngleDeg(cx: number, cy: number) {
    const len = Math.sqrt(Math.pow(cx, 2) + Math.pow(cy, 2));
    cy /= len;
    cx /= len;
    // Rad to Deg
    let theta = Math.atan2(cy, cx) * (180 / Math.PI);
    if (theta < 0) {
        theta += 360;
    }
    return theta;
}

export function directionVectorToQuaternion(cx: number, cy: number) {
    let theta = directionToAngleDeg(cx, cy);
    theta *= Math.PI / 180;
    return angleDegToQuaternion(-theta);
}
