import { useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useOrbitStore, type ConnectionType } from '../../stores/orbitStore';

// Node component for each movie
function MovieNode({
  position,
  movie,
  isActive,
  isSaved,
  onClick,
}: {
  position: [number, number, number];
  movie: { id: number; title: string; posterPath: string | null; dominantHex: string };
  isActive: boolean;
  isSaved: boolean;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const scale = isActive ? 1.2 : 1;

  useFrame((state) => {
    if (meshRef.current) {
      // Gentle floating animation
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime + movie.id) * 0.05;
    }
  });

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onClick={onClick}
        scale={[scale, scale * 1.5, 0.1]}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={movie.dominantHex}
          emissive={isActive ? movie.dominantHex : '#000000'}
          emissiveIntensity={isActive ? 0.3 : 0}
        />
      </mesh>
      
      {/* Saved indicator */}
      {isSaved && (
        <mesh position={[0.4, 0.6, 0.1]} scale={0.15}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.5} />
        </mesh>
      )}
      
      {/* Title label */}
      <Text
        position={[0, -1, 0]}
        fontSize={0.12}
        color="white"
        anchorX="center"
        anchorY="top"
        maxWidth={1.5}
      >
        {movie.title}
      </Text>
    </group>
  );
}

// Edge component for connections
function ConnectionEdge({
  start,
  end,
  connectionType,
}: {
  start: [number, number, number];
  end: [number, number, number];
  connectionType: ConnectionType;
}) {
  const color = useMemo(() => {
    switch (connectionType) {
      case 'vibe':
        return '#3b82f6'; // Blue
      case 'auteur':
        return '#f59e0b'; // Amber
      case 'aesthetic':
        return '#ec4899'; // Pink
      default:
        return '#6b7280'; // Gray
    }
  }, [connectionType]);

  return (
    <Line
      points={[start, end]}
      color={color}
      lineWidth={2}
      opacity={0.6}
      transparent
    />
  );
}

// Camera controller for smooth navigation
function CameraController({ targetPosition }: { targetPosition: [number, number, number] }) {
  const { camera } = useThree();
  
  useFrame(() => {
    camera.position.lerp(
      new THREE.Vector3(targetPosition[0], targetPosition[1], targetPosition[2] + 5),
      0.05
    );
    camera.lookAt(targetPosition[0], targetPosition[1], targetPosition[2]);
  });

  return null;
}

// Main constellation scene
function ConstellationScene() {
  const { history, historyIndex, edges, jumpToNode } = useOrbitStore();

  // Calculate node positions in a spiral pattern
  const nodePositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    
    history.forEach((_, index) => {
      // Spiral layout
      const angle = index * 0.8;
      const radius = 1 + index * 0.3;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * 0.5;
      const z = -index * 0.5;
      
      positions.push([x, y, z]);
    });
    
    return positions;
  }, [history]);

  // Current active position for camera
  const activePosition = nodePositions[historyIndex] || [0, 0, 0];

  const handleNodeClick = useCallback((index: number) => {
    jumpToNode(index);
  }, [jumpToNode]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />

      {/* Edges */}
      {edges.map((edge, index) => {
        const fromIndex = history.findIndex((n) => n.movie.id === edge.fromId);
        const toIndex = history.findIndex((n) => n.movie.id === edge.toId);
        
        if (fromIndex === -1 || toIndex === -1) return null;
        
        return (
          <ConnectionEdge
            key={`edge-${index}`}
            start={nodePositions[fromIndex]}
            end={nodePositions[toIndex]}
            connectionType={edge.connectionType}
          />
        );
      })}

      {/* Nodes */}
      {history.map((node, index) => (
        <MovieNode
          key={node.movie.id}
          position={nodePositions[index]}
          movie={node.movie}
          isActive={index === historyIndex}
          isSaved={node.saved}
          onClick={() => handleNodeClick(index)}
        />
      ))}

      {/* Camera */}
      <CameraController targetPosition={activePosition} />
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={2}
        maxDistance={20}
      />
    </>
  );
}

export default function ConstellationView() {
  const { history } = useOrbitStore();

  if (history.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-white/50">No films explored yet</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 60 }}
        style={{ background: 'transparent' }}
      >
        <ConstellationScene />
      </Canvas>

      {/* Legend */}
      <div className="absolute bottom-20 left-4 right-4 flex justify-center">
        <div className="flex gap-4 px-4 py-2 rounded-full bg-black/50 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-blue-500 rounded" />
            <span className="text-white/50 text-xs">Vibe</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-amber-500 rounded" />
            <span className="text-white/50 text-xs">Auteur</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-pink-500 rounded" />
            <span className="text-white/50 text-xs">Aesthetic</span>
          </div>
        </div>
      </div>
    </div>
  );
}

