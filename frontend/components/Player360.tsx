"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type CommandSignals = {
  left: number;
  right: number;
  up: number;
  down: number;
  gyro: number;
  recenter: number;
};

type Player360Props = {
  src?: string;
  stereoEnabled?: boolean;
  fillContainer?: boolean;
  commandSignals?: CommandSignals;
  fitMode?: "contain" | "cover";
};

export default function Player360({
  src,
  stereoEnabled = false,
  fillContainer = false,
  commandSignals,
  fitMode = "contain",
}: Player360Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rotateByRef = useRef<(deltaLon: number, deltaLat: number) => void>(() => undefined);
  const enableGyroRef = useRef<() => Promise<void>>(async () => undefined);
  const recenterRef = useRef<() => void>(() => undefined);
  const lastSignalsRef = useRef<CommandSignals>({
    left: 0,
    right: 0,
    up: 0,
    down: 0,
    gyro: 0,
    recenter: 0,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = Math.max(400, container.clientHeight || 500);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1100);
    const leftCamera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1100);
    const rightCamera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1100);
    const zoomLevel = fitMode === "cover" ? 1.35 : 1;
    camera.zoom = zoomLevel;
    leftCamera.zoom = zoomLevel;
    rightCamera.zoom = zoomLevel;
    camera.position.set(0, 0, 0.1);
    leftCamera.position.set(0, 0, 0.1);
    rightCamera.position.set(0, 0, 0.1);
    camera.updateProjectionMatrix();
    leftCamera.updateProjectionMatrix();
    rightCamera.updateProjectionMatrix();

    const geometry = new THREE.SphereGeometry(500, 64, 40);
    geometry.scale(-1, 1, 1);

    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.loop = true;
    video.muted = true;
    video.playsInline = true;

    if (src) {
      video.src = src;
      video.play().catch(() => undefined);
    }

    const texture = src
      ? new THREE.VideoTexture(video)
      : new THREE.TextureLoader().load("https://threejs.org/examples/textures/2294472375_24a3b8ef46_o.jpg");

    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshBasicMaterial({ map: texture });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const defaultLon = 180;
    const defaultLat = 0;
    let lon = defaultLon;
    let lat = defaultLat;
    let isDown = false;
    let startX = 0;
    let startY = 0;
    let gyroEnabled = false;
    let gyroPermissionGranted = false;
    let gyroCenterAlpha: number | null = null;

    function onPointerDown(event: PointerEvent) {
      isDown = true;
      startX = event.clientX;
      startY = event.clientY;
    }

    function onPointerMove(event: PointerEvent) {
      if (!isDown) return;
      lon += (startX - event.clientX) * 0.1;
      lat += (event.clientY - startY) * 0.1;
      startX = event.clientX;
      startY = event.clientY;
    }

    function onPointerUp() {
      isDown = false;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") lon -= 2;
      if (event.key === "ArrowRight") lon += 2;
      if (event.key === "ArrowUp") lat += 2;
      if (event.key === "ArrowDown") lat -= 2;
    }

    function rotateBy(deltaLon: number, deltaLat: number) {
      lon += deltaLon;
      lat += deltaLat;
    }

    function recenterView() {
      lon = defaultLon;
      lat = defaultLat;
      gyroCenterAlpha = null;
    }

    async function enableGyro() {
      try {
        const orientation = window.DeviceOrientationEvent as
          | (typeof DeviceOrientationEvent & {
              requestPermission?: () => Promise<"granted" | "denied">;
            })
          | undefined;

        if (orientation?.requestPermission) {
          const result = await orientation.requestPermission();
          gyroPermissionGranted = result === "granted";
        } else {
          gyroPermissionGranted = true;
        }

        gyroEnabled = gyroPermissionGranted;
        gyroCenterAlpha = null;
      } catch {
        gyroEnabled = false;
      }
    }

    function onDeviceOrientation(event: DeviceOrientationEvent) {
      if (!gyroEnabled) return;
      if (isDown) return;
      if (event.alpha == null || event.beta == null) return;

      if (gyroCenterAlpha === null) {
        gyroCenterAlpha = event.alpha;
      }

      const relativeYaw = event.alpha - gyroCenterAlpha;
      lon = defaultLon - relativeYaw;
      lat = Math.max(-85, Math.min(85, event.beta - 45));
    }

    rotateByRef.current = rotateBy;
    enableGyroRef.current = enableGyro;
    recenterRef.current = recenterView;

    container.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("deviceorientation", onDeviceOrientation);

    const animate = () => {
      requestAnimationFrame(animate);

      lat = Math.max(-85, Math.min(85, lat));
      const phi = THREE.MathUtils.degToRad(90 - lat);
      const theta = THREE.MathUtils.degToRad(lon);

      const lookX = 500 * Math.sin(phi) * Math.cos(theta);
      const lookY = 500 * Math.cos(phi);
      const lookZ = 500 * Math.sin(phi) * Math.sin(theta);

      camera.lookAt(lookX, lookY, lookZ);

      if (!stereoEnabled) {
        renderer.setScissorTest(false);
        renderer.render(scene, camera);
        return;
      }

      const eyeYawOffset = 1.2;
      const leftTheta = THREE.MathUtils.degToRad(lon - eyeYawOffset);
      const rightTheta = THREE.MathUtils.degToRad(lon + eyeYawOffset);

      leftCamera.lookAt(
        500 * Math.sin(phi) * Math.cos(leftTheta),
        lookY,
        500 * Math.sin(phi) * Math.sin(leftTheta),
      );
      rightCamera.lookAt(
        500 * Math.sin(phi) * Math.cos(rightTheta),
        lookY,
        500 * Math.sin(phi) * Math.sin(rightTheta),
      );

      renderer.setScissorTest(true);
      const halfWidth = Math.floor(renderer.domElement.width / 2);
      const fullHeight = renderer.domElement.height;

      renderer.setViewport(0, 0, halfWidth, fullHeight);
      renderer.setScissor(0, 0, halfWidth, fullHeight);
      renderer.render(scene, leftCamera);

      renderer.setViewport(halfWidth, 0, renderer.domElement.width - halfWidth, fullHeight);
      renderer.setScissor(halfWidth, 0, renderer.domElement.width - halfWidth, fullHeight);
      renderer.render(scene, rightCamera);

      renderer.setScissorTest(false);
    };

    animate();

    const resizeObserver = new ResizeObserver(() => {
      const newWidth = container.clientWidth;
      const newHeight = Math.max(400, container.clientHeight || 500);
      renderer.setSize(newWidth, newHeight);
      camera.aspect = newWidth / newHeight;
      leftCamera.aspect = newWidth / newHeight;
      rightCamera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      leftCamera.updateProjectionMatrix();
      rightCamera.updateProjectionMatrix();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("deviceorientation", onDeviceOrientation);

      if (video.src) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }

      texture.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [src, stereoEnabled, fitMode]);

  useEffect(() => {
    if (!commandSignals) return;

    const previous = lastSignalsRef.current;

    if (commandSignals.left !== previous.left) {
      rotateByRef.current(-5, 0);
    }
    if (commandSignals.right !== previous.right) {
      rotateByRef.current(5, 0);
    }
    if (commandSignals.up !== previous.up) {
      rotateByRef.current(0, 5);
    }
    if (commandSignals.down !== previous.down) {
      rotateByRef.current(0, -5);
    }
    if (commandSignals.gyro !== previous.gyro) {
      void enableGyroRef.current();
    }
    if (commandSignals.recenter !== previous.recenter) {
      recenterRef.current();
    }

    lastSignalsRef.current = commandSignals;
  }, [commandSignals]);

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: fillContainer ? "100%" : "70vh",
          borderRadius: fillContainer ? 0 : 12,
          overflow: "hidden",
        }}
      />
    </div>
  );
}
