import { features } from '~/appConfig/features';
import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import Loader from 'react-spinners/PuffLoader';

import { appConfig } from '~/appConfig';
import { PlayIcon } from '~/components/Icons';
import LauncherDialog from './components/LauncherDialog';
import SupportMenu from './components/SupportMenu';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 20px 20px 0;
`;
const PlaylistTitle = styled.div`
  border-bottom: 1px solid #222;
  color: #888;
  padding: 5px 0 15px;
  text-align: center;
  text-transform: uppercase;
`;
const PlaylistWrapperOuter = styled.div`
  flex: 1;
  overflow: hidden auto;
  padding: 25px 5px;
`;
const PlaylistWrapper = styled.div`
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  width: 100%;
`;
const VideoWrapper = styled.div`
  width: 100%;
`;
const VideoThumbnail = styled.div`
  background: url(${p => p.src});
  background-position: left center;
  background-size: cover;
  border: 1px solid ${p => p.theme.colors.darkMain};
  cursor: ${p => p.theme.cursors.active};
  padding-top: 56.25%;
  position: relative;
  width: 100%;
  transition: border-color 150ms ease;
  & > div {
    align-items: center;
    background: rgba(${p => p.theme.colors.mainRGB}, 0.15);
    bottom: 0;
    display: flex;
    left: 0;
    justify-content: center;
    opacity: 0;
    position: absolute;
    right: 0;
    top: 0;
    transition: opacity 150ms ease;
    & > div {
      align-items: center;
      background: ${p => p.theme.colors.main};
      border-radius: 60px;
      color: white;
      font-size: 40px;
      display: flex;
      height: 60px;
      justify-content: center;
      width: 60px;
    }
  }
  &:hover {
    border-color: ${p => p.theme.colors.main};
    & > div {
      opacity: 1;
    }
  }
`;
const VideoInfo = styled.div`
  padding: 5px 0 10px;
  & > label {
    color: white;
    cursor: ${p => p.theme.cursors.active};
    display: block;
    margin: 10px 0;
    &:hover {
      text-decoration: underline;
    }
  }
  & > div {
    color: #888;
    display: block;
    font-size: 13px;
    & > span {
      color: #AAA;
      cursor: ${p => p.theme.cursors.active};
      opacity: 0.8;
      text-decoration: underline;
      transition: opacity 150ms ease;
      &:hover {
        opacity: 1;
      }
    }
  }
`;

const LoadingWrapper = styled.div`
  align-items: center;
  display: flex;
  height: 100%;
  justify-content: center;
  width: 100%;
`;

const ErrorWrapper = styled(LoadingWrapper)``;

const YoutubeFeed = ({ playlistId, title }) => {
  const [error, setError] = useState();
  const [loading, setLoading] = useState();
  const [videos, setVideos] = useState();

  useEffect(() => {
    setVideos();

    if (playlistId) {
      setLoading(true);
      try {
        fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${appConfig.get('Api.ClientId.google')}`).then(async (response) => {
          const data = await response.json();
          setVideos(data.items.filter((v) => !!v.snippet?.videoOwnerChannelId)); // (this filters out private videos)
          setLoading(false);
        });
      } catch (e) {
        console.error('Error fetching playlist videos:', e);
        setError(true);
        setLoading(false);
      }
    }
  }, [playlistId]);

  const onClickOwner = useCallback((v) => {
    if (v.snippet?.videoOwnerChannelId) {
      window.open(`https://www.youtube.com/channel/${v.snippet?.videoOwnerChannelId}`);
    }
  }, []);

  const onClickVideo = useCallback((v) => {
    if (v.snippet?.resourceId?.videoId) {
      window.open(`http://youtube.com/watch?v=${v.snippet?.resourceId?.videoId}&list=${playlistId}`)
    }
  }, [playlistId]);

  return (
    <Wrapper>
      <PlaylistTitle>{title}</PlaylistTitle>
      <PlaylistWrapperOuter>
        {!playlistId && <ErrorWrapper>Coming soon.</ErrorWrapper>}
        {playlistId && error && <ErrorWrapper>Something went wrong. Please try again.</ErrorWrapper>}
        {playlistId && !error && loading && <LoadingWrapper><Loader color="white" size="60px" /></LoadingWrapper>}
        {playlistId && !error && !loading && (
          <PlaylistWrapper>
            {(videos || []).map((v) => (
              <VideoWrapper key={v.id} onClick={() => onClickVideo(v)}>
                <VideoThumbnail src={v.snippet.thumbnails?.medium?.url}>
                  <div><div><PlayIcon /></div></div>
                </VideoThumbnail>
                <VideoInfo>
                  <label onClick={() => onClickVideo(v)}>{(v.snippet?.title || '').replace(' - Official Guide', '')}</label>
                  <div>by <span onClick={() => onClickOwner(v)}>{v.snippet?.videoOwnerChannelTitle}</span></div>
                </VideoInfo>
              </VideoWrapper>
            ))}
          </PlaylistWrapper>
        )}
      </PlaylistWrapperOuter>
    </Wrapper>
  );
};

const panes = [
  ...(features.tutorials ? [{
    label: 'Tutorials',
    pane: <YoutubeFeed title="Official Tutorial Videos" playlistId="PLEu_4bnIEcK7dt9r_JHReo8n2JdLPpby_" />
  },
  {
    label: 'Community Content',
    pane: <YoutubeFeed title="Unofficial Tutorial Videos" playlistId="PLEu_4bnIEcK69LKrz3v64PLzXxbpdSI8e" />
  },
  {
    label: 'Non-English Content',
    pane: <YoutubeFeed title="Unofficial Tutorial Videos (Non-English)" playlistId="PLEu_4bnIEcK7JDPyrAfPNBZnQacYtWAbG" />
  }
  ] : []),
  {
    label: 'Game Wiki',
    link: appConfig.get('Url.wiki'),
    pane: (
      <Wrapper>
        <h2>Game Wiki</h2>
        <p>Explore the guides and reference material in the <a href={appConfig.get('Url.wiki')} target="_blank" rel="noopener noreferrer">Influence Wiki</a>.</p>
      </Wrapper>
    )
  }
];

const Help = () => (
  <LauncherDialog
    bottomLeftMenu={<SupportMenu />}
    panes={panes} />
);

export default Help;