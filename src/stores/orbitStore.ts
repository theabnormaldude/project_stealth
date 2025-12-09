import { create } from 'zustand';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';
export type ConnectionType = 'vibe' | 'aesthetic' | 'auteur' | 'entry';

export interface OrbitMovie {
  id: number;
  title: string;
  year: string;
  posterPath: string | null;
  backdropPath: string | null;
  dominantHex: string;
  mediaType: 'movie' | 'tv';
  director?: string;
  cinematographer?: string;
  genres?: string[];
}

export interface OrbitEdge {
  fromId: number;
  toId: number;
  connectionType: ConnectionType;
  connectionReason: string;
  similarityScore: number;
}

export interface OrbitNode {
  movie: OrbitMovie;
  timestamp: number;
  saved: boolean;
}

interface OrbitState {
  // Session state
  isActive: boolean;
  entryMovie: OrbitMovie | null;
  currentMovie: OrbitMovie | null;
  
  // History tracking
  history: OrbitNode[];
  historyIndex: number;
  edges: OrbitEdge[];
  
  // UI state
  isTransitioning: boolean;
  showConstellation: boolean;
  pendingDirection: SwipeDirection | null;
  
  // Pre-fetched next moves with connection info
  prefetchedMoves: {
    vibe: { movie: OrbitMovie; connectionReason: string; similarityScore: number } | null;
    aesthetic: { movie: OrbitMovie; connectionReason: string; similarityScore: number } | null;
    auteur: { movie: OrbitMovie; connectionReason: string; similarityScore: number } | null;
  };
  
  // Actions
  enterOrbit: (movie: OrbitMovie) => void;
  exitOrbit: () => void;
  navigateTo: (movie: OrbitMovie, direction: SwipeDirection, connectionReason: string, similarityScore: number) => void;
  goBack: () => boolean;
  jumpToNode: (index: number) => void;
  toggleSaved: (movieId: number) => void;
  setTransitioning: (value: boolean) => void;
  setShowConstellation: (value: boolean) => void;
  setPendingDirection: (direction: SwipeDirection | null) => void;
  setPrefetchedMoves: (moves: Partial<OrbitState['prefetchedMoves']>) => void;
  getSavedMovies: () => OrbitNode[];
  reset: () => void;
}

const directionToConnectionType = (direction: SwipeDirection): ConnectionType => {
  switch (direction) {
    case 'left': return 'vibe';
    case 'up': return 'auteur';
    case 'down': return 'aesthetic';
    default: return 'vibe';
  }
};

const initialState = {
  isActive: false,
  entryMovie: null,
  currentMovie: null,
  history: [],
  historyIndex: -1,
  edges: [],
  isTransitioning: false,
  showConstellation: false,
  pendingDirection: null,
  prefetchedMoves: {
    vibe: null,
    aesthetic: null,
    auteur: null,
  },
};

export const useOrbitStore = create<OrbitState>((set, get) => ({
  ...initialState,

  enterOrbit: (movie: OrbitMovie) => {
    const node: OrbitNode = {
      movie,
      timestamp: Date.now(),
      saved: false,
    };
    
    set({
      isActive: true,
      entryMovie: movie,
      currentMovie: movie,
      history: [node],
      historyIndex: 0,
      edges: [],
      isTransitioning: false,
      showConstellation: false,
      prefetchedMoves: { vibe: null, aesthetic: null, auteur: null },
    });
  },

  exitOrbit: () => {
    set(initialState);
  },

  navigateTo: (movie: OrbitMovie, direction: SwipeDirection, connectionReason: string, similarityScore: number) => {
    const state = get();
    if (!state.currentMovie) return;

    const node: OrbitNode = {
      movie,
      timestamp: Date.now(),
      saved: false,
    };

    const edge: OrbitEdge = {
      fromId: state.currentMovie.id,
      toId: movie.id,
      connectionType: directionToConnectionType(direction),
      connectionReason,
      similarityScore,
    };

    // If we're not at the end of history, truncate forward history
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(node);

    set({
      currentMovie: movie,
      history: newHistory,
      historyIndex: newHistory.length - 1,
      edges: [...state.edges, edge],
      isTransitioning: false,
      pendingDirection: null,
      prefetchedMoves: { vibe: null, aesthetic: null, auteur: null },
    });
  },

  goBack: () => {
    const state = get();
    if (state.historyIndex <= 0) return false;

    const newIndex = state.historyIndex - 1;
    const previousNode = state.history[newIndex];

    set({
      currentMovie: previousNode.movie,
      historyIndex: newIndex,
      isTransitioning: false,
      pendingDirection: null,
    });

    return true;
  },

  jumpToNode: (index: number) => {
    const state = get();
    if (index < 0 || index >= state.history.length) return;

    const node = state.history[index];
    set({
      currentMovie: node.movie,
      historyIndex: index,
      showConstellation: false,
      isTransitioning: false,
    });
  },

  toggleSaved: (movieId: number) => {
    const state = get();
    const newHistory = state.history.map((node) =>
      node.movie.id === movieId ? { ...node, saved: !node.saved } : node
    );
    set({ history: newHistory });
  },

  setTransitioning: (value: boolean) => {
    set({ isTransitioning: value });
  },

  setShowConstellation: (value: boolean) => {
    set({ showConstellation: value });
  },

  setPendingDirection: (direction: SwipeDirection | null) => {
    set({ pendingDirection: direction });
  },

  setPrefetchedMoves: (moves: Partial<OrbitState['prefetchedMoves']>) => {
    const state = get();
    set({
      prefetchedMoves: { ...state.prefetchedMoves, ...moves },
    });
  },

  getSavedMovies: () => {
    return get().history.filter((node) => node.saved);
  },

  reset: () => {
    set(initialState);
  },
}));

