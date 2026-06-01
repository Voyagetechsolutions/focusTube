/**
 * Static video catalog. Every entry is a *direct* media file (mp4) — never an
 * iframe embed — so the focus-enforcing <video> player can own playback.
 *
 * Sources are long-lived public test files (W3C media samples, the Blender
 * download server, and test-videos.co.uk). All support HTTP range requests, so
 * seeking works. We deliberately avoid Google's old gtv-videos-bucket, which
 * now returns 403.
 */
export interface Video {
  id: string;
  title: string;
  creator: string;
  durationLabel: string;
  description: string;
  src: string;
  /** Optional poster; when absent the catalog renders a styled placeholder. */
  poster?: string;
  /** Accent color for the placeholder card. */
  accent: string;
}

export const CATALOG: Video[] = [
  {
    id: "big-buck-bunny",
    title: "Big Buck Bunny",
    creator: "Blender Foundation",
    durationLabel: "0:33",
    description:
      "A giant rabbit takes revenge on three rodents. The Blender Project's classic open movie (trailer).",
    src: "https://media.w3.org/2010/05/bunny/trailer.mp4",
    accent: "#5b8cff",
  },
  {
    id: "sintel",
    title: "Sintel",
    creator: "Blender Foundation",
    durationLabel: "0:52",
    description:
      "A lone warrior searches for a young dragon she befriended. Durian open movie (trailer).",
    src: "https://media.w3.org/2010/05/sintel/trailer.mp4",
    accent: "#ff5d6c",
  },
  {
    id: "sample-reel",
    title: "Sample Reel",
    creator: "W3C",
    durationLabel: "0:28",
    description:
      "A short reference clip from the W3C media samples — useful for general playback testing.",
    src: "https://media.w3.org/2010/05/video/movie_300.mp4",
    accent: "#3ddc97",
  },
  {
    id: "focus-test-clip",
    title: "Focus Test Clip",
    creator: "test-videos.co.uk",
    durationLabel: "0:10",
    description:
      "A 10-second clip — handy for quickly exercising the tab-hide and off-screen auto-pause behavior.",
    src: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4",
    accent: "#ffb454",
  },
];

export function getVideo(id: string): Video | undefined {
  return CATALOG.find((v) => v.id === id);
}
