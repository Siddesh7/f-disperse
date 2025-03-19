import { ImageResponse } from "next/og";

export const alt = "disperse but with farcaster";
export const size = {
  width: 600,
  height: 400,
};

export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div tw="h-full w-full flex flex-col justify-center items-center relative bg-white">
        <h1 tw="text-6xl text-center">f(disperse)</h1>
        <p tw="text-3xl text-center">send $eth to N users at once</p>
      </div>
    ),
    {
      ...size,
    }
  );
}
