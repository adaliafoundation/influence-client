// import React, { useCallback, useEffect, useMemo } from 'react';
// import { useHistory, useParams } from 'react-router-dom';
// import styled, { keyframes } from 'styled-components';
// import { Crewmate } from '@influenceth/sdk';

// import useSession from '~/hooks/useSession';
// import Button from '~/components/Button';
// import CrewmateCard from '~/components/CrewmateCard';
// import CrewTraitIcon from '~/components/CrewTraitIcon';
// import Details from '~/components/DetailsModal';
// import { LinkIcon, TwitterIcon } from '~/components/Icons';
// import useCrewContext from '~/hooks/useCrewContext';
// import useStorySession from '~/hooks/useStorySession';

// const slideOutTransition = keyframes`
//   0% {
//     height: 296px;
//     width: 0;
//     overflow: hidden;
//   }
//   50% {
//     height: 296px;
//     width: 400px;
//     overflow: hidden;
//   }
//   100% {
//     overflow: auto;
//     width: 400px;
//   }
// `;

// const mobileSlideOutTransition = keyframes`
//   0% {
//     transform: scaleX(0);
//   }
//   50% {
//     transform: scaleX(1);
//   }
//   100% {
//     transform: scaleX(1);
//   }
// `;

// const opacityTransition = keyframes`
//   0% { opacity: 0; }
//   75% { opacity: 0; }
//   100% { opacity: 1; }
// `;

// const TitleBox = styled.div`
//   background: rgba(0, 0, 0, 0.8);
//   padding: 24px 0;
// `;
// const Title = styled.div`
//   border-bottom: 1px solid #222;
//   color: white;
//   display: flex;
//   font-size: 40px;
//   font-weight: light;
//   line-height: 40px;
//   justify-content: center;
//   margin: 0 auto 6px;
//   overflow: visible;
//   padding-bottom: 12px;
//   text-transform: uppercase;
//   white-space: nowrap;
//   width: 250px;

//   @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
//     white-space: normal;
//   }
// `;
// const Subtitle = styled.div`
//   color: white;
//   font-size: 16px;
//   font-weight: bold;
//   white-space: nowrap;
// `;

// const ImageryContainer = styled.div`
//   display: flex;
//   flex: 1;
//   padding: 25px 0 0;
//   position: relative;

//   & > div:first-child {
//     background-image: url(${p => p.src});
//     background-repeat: no-repeat;
//     background-position: center center;
//     background-size: cover;
//     position: absolute;
//     top: 0;
//     bottom: 0;
//     left: 0;
//     right: 0;
//     z-index: 1;
//     mask-image: linear-gradient(to bottom, black 0%, rgba(0, 0, 0, 0.7) 50%, transparent 100%);
//     transition: opacity 750ms ease-out, background-image 750ms ease-out;
//   }
//   & > div:last-child {
//     position: relative;
//     z-index: 2;
//   }

//   @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
//     padding-top: 15px;
//   }
// `;
// const CardWrapper = styled.div`
//   align-items: center;
//   display: flex;
//   flex-direction: row;
//   flex-wrap: wrap;
//   padding: 30px;
//   justify-content: center;
//   width: 100%;
//   @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
//     padding: 20px 0;
//   }
// `;

// const CardContainer = styled.div`
//   border: 1px solid rgba(255, 255, 255, 0.35);
//   padding: 4px;
//   position: relative;
//   z-index: 3;
//   & > div {
//     background: black;
//     max-width: 100%;
//     padding: 8px;
//     width: 220px;
//   }
// `;

// const SlideOut = styled.div`
//   display: flex;
//   flex-direction: column;
//   justify-content: center;
//   @media (min-width: ${p => p.theme.breakpoints.mobile}px) {
//     animation: ${slideOutTransition} 500ms normal forwards ease-out 500ms;
//     height: 296px;
//     margin-left: -6px;
//     overflow: hidden;
//     width: 0;
//   }
//   @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
//     animation: ${mobileSlideOutTransition} 500ms normal forwards ease-out 500ms;
//     transform: scaleX(0);
//   }
// `;

// const RewardSection = styled.div`
//   background: black;
//   display: flex;
//   flex-direction: column;
//   justify-content: center;
//   max-height: 296px;

//   & > div {
//     animation: ${opacityTransition} 500ms normal forwards ease-out 500ms;
//     color: white;
//     opacity: 0;
//     padding: 24px 24px 0px 36px;
//     text-align: left;
//     width: 400px;

//     & > h4 {
//       border-bottom: 1px solid rgba(255, 255, 255, 0.2);
//       font-size: 16px;
//       font-weight: bold;
//       margin: 0 0 16px;
//       padding-bottom: 16px;
//       @media (max-width: ${p => p.theme.breakpoints.mobile}px) {

//         font-size: 14px;
//         font-weight: bold;
//       }
//     }
//     & > div {
//       align-items: flex-start;
//       display: flex;
//       margin-bottom: 24px;
//       & > *:first-child {
//         font-size: 48px;
//         margin-left: -12px;
//         margin-right: 12px;
//       }
//       & > *:last-child {
//         font-size: 13px;
//         margin-bottom: 0;
//         & > b {
//           display: block;
//           margin-bottom: 4px;
//         }
//         & > span {
//           font-size: 12px;
//           opacity: 0.7;
//         }
//       }
//     }

//     @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
//       padding: 12px 25px 0;
//       width: 100%;
//     }
//   }

//   @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
//     background: rgba(0, 0, 0, 0.8);
//     height: auto;
//     margin: -20px 8px 0;
//     max-width: 400px;
//     padding: 20px 0 0px;
//   }
// `;

// const RecruitSection = styled.div`
//   animation: ${opacityTransition} 500ms normal forwards ease-out 750ms;
//   opacity: 0;
//   & button {
//     display: flex;
//     height: 66px;
//     justify-content: space-between;
//     margin: 0 auto 10px;
//     text-transform: uppercase;
//     width: 300px;
//   }
//   @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
//     margin-bottom: 16px;
//   }
// `;
// const TwitterButton = styled(Button)`
//   color: white;
//   background: #1b9df0;
//   border-color: #1b9df0;
//   font-weight: bold;
//   justify-content: center !important;
//   & > span {
//     font-size: 16px;
//     margin-right: 32px;
//     white-space: nowrap;
//   }
//   & > svg {
//     font-size: 36px;
//     max-height: 36px;
//     max-width: 36px;
//   }
// `;
// const LinkWithIcon = styled.a`
//   align-items: center;
//   cursor: ${p => p.theme.cursors.active};
//   display: flex;
//   font-size: 80%;
//   font-weight: bold;
//   justify-content: center;
//   text-shadow: 1px 2px 3px rgba(0, 0, 0, 1);
//   text-transform: uppercase;
//   white-space: nowrap;
//   & > * {
//     color: #BBB;
//     transition: color 100ms ease;
//   }
//   & > span {
//     margin-left: 4px;
//   }
//   &:hover > * {
//     color: #EEE;
//   }
// `;

// const FinishContainer = styled.div`
//   padding-bottom: 25px;
//   padding-right: 35px;
//   text-align: right;
//   & > button {
//     display: inline-block;
//     text-transform: uppercase;
//   }
//   @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
//     padding-bottom: 12px;
//     padding-right: 24px;
//   }
// `;

// const CrewAssignmentComplete = () => {
//   const { accountAddress } = useSession();
//   const { id: sessionId } = useParams();
//   const history = useHistory();
//   const { crewmateMap } = useCrewContext();
//   const { storyState } = useStorySession(sessionId);

//   const onCloseDestination = useMemo(
//     () => `/crew-assignments/${storyState?.book}/${storyState?.story}`,
//     [storyState?.book, storyState?.story]
//   );

//   const crew = useMemo(
//     () => crewmateMap && storyState && crewmateMap[storyState.owner],
//     [storyState, crewmateMap]
//   );

//   const rewards = useMemo(() => {
//     return (storyState?.accruedTraits || []).map((id) => ({
//       id,
//       ...Crewmate.getTrait(id)
//     }));
//   }, [storyState?.accruedTraits]);

//   const shareOnTwitter = useCallback(() => {
//     const params = new URLSearchParams({
//       text: [
//         `I just completed the Crew Assignment: "${storyState.title}"`,
//         `Be one of the first to join @influenceth and explore Adalia today!`,
//         `Join Now:`,
//       ].join('\n\n'),
//       hashtags: 'PlayToEarn,NFTGaming',
//       //via: 'influenceth'
//     });
//     window.open(`https://twitter.com/intent/tweet?${params.toString()}`, '_blank');
//   }, [accountAddress, sessionId, storyState]);

//   const handleFinish = useCallback(() => {
//     history.push(onCloseDestination);
//   }, [history, onCloseDestination]);

//   // show "create" page for recruitment assignments
//   useEffect(() => {
//     if (storyState && (storyState.tags || []).includes('ADALIAN_RECRUITMENT')) {
//       history.push(`/crew-assignment/${sessionId}/create`);
//     }
//   }, [!!storyState]); // eslint-disable-line react-hooks/exhaustive-deps

//   const slideOutContents = useMemo(() =>
//     rewards?.length > 0
//       ? (
//           <RewardSection>
//             <div>
//               <h4>This crewmate has gained traits:</h4>
//               {rewards.map((reward) => (
//                 <div key={reward.id}>
//                   <CrewTraitIcon trait={reward.id} />
//                   <div style={{ flex: 1 }}>
//                     <b>{reward.name}</b>
//                     <span>{reward.description}</span>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </RewardSection>
//         )
//       : null
//   , [rewards]);

//   if (!storyState || !crew) return null;
//   return (
//     <Details
//       onCloseDestination={onCloseDestination}
//       contentProps={{ style: { display: 'flex', flexDirection: 'column', } }}
//       edgeToEdge
//       style={{ color: '#999', textAlign: 'center' }}
//       width="max">
//       <ImageryContainer src={storyState.image}>
//         <div />
//         <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly' }}>
//           <TitleBox>
//             <Title>Assignment Complete</Title>
//             <Subtitle>{storyState.title}</Subtitle>
//           </TitleBox>
//           <div>
//             <CardWrapper>
//               <CardContainer>
//                 <div>
//                   <CrewmateCard crewmate={crew} />
//                 </div>
//               </CardContainer>
//               {slideOutContents && (
//                 <SlideOut>
//                   {slideOutContents}
//                 </SlideOut>
//               )}
//             </CardWrapper>

//             <RecruitSection>
//               {!appConfig.get('App.hideSocial') && (
//                 <TwitterButton onClick={shareOnTwitter}>
//                   <span>Share on Twitter</span>
//                   <TwitterIcon />
//                 </TwitterButton>
//               )}
//                 <LinkWithIcon>
//                   <LinkIcon />
//                   <span>Copy Recruitment Link</span>
//                 </LinkWithIcon>
//             </RecruitSection>
//           </div>
//           {/* NOTE: the below empty div's are to help with flex spacing on tall screens */}
//           <div />
//           <div />
//         </div>
//       </ImageryContainer>

//       <FinishContainer>
//         <Button onClick={handleFinish}>Finish</Button>
//       </FinishContainer>
//     </Details>
//   );
// };

// export default CrewAssignmentComplete;
