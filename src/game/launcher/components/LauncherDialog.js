import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';

import ClipCorner from '~/components/ClipCorner';
import NavIcon from '~/components/NavIcon';
import { CloseIcon, LinkIcon } from '~/components/Icons';
import { reactBool } from '~/lib/utils';
import theme from '~/theme';
import IconButton from '~/components/IconButton';
import useStore from '~/hooks/useStore';
import AttentionDot from '~/components/AttentionDot';
import Badge from '~/components/Badge';

const borderColor = '#222;'

const DialogWrapper = styled.div`
  align-items: center;
  display: flex;
  justify-content: center;
  margin-left: 250px;
  padding: 0 25px;
  width: calc(100% - 285px);
`;

const Padding = styled.div`
  background: rgb(20, 20, 20, 0.5);
  padding: 8px;
  ${p => p.theme.clipCorner(34)};
`;

const Dialog = styled.div`
  background: black;
  border: 1px solid ${borderColor};
  ${p => p.theme.clipCorner(30)};
  display: flex;
  flex-direction: row;
  position: relative;
`;
const PaneWrapper = styled.div`
  border-left: ${p => p.singlePane ? 0 : `1px solid ${borderColor}`};
  height: calc(100vh - 250px);
  overflow: ${p => p.overflow || 'hidden auto'};
  width: ${p => p.singlePane ? 1375 : 1075}px;
`;

const TabWrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 0 0 300px;
  max-height: calc(100vh - 250px);
  overflow: hidden auto;
  padding: 15px 0;
`;

const NavIconWrapper = styled.span`
  font-size: 125%;
  margin-right: 4px;
  opacity: 0;
  transition: opacity 150ms ease;
`;
const Label = styled.label`
  display: flex;
  flex-direction: column;
  margin-right: 5px;
`;
const Sublabel = styled.span`
  font-size: 12px;
  opacity: 0.75;
  text-transform: none;
`;
const AttentionIcon = styled.div`
  color: ${p => p.theme.colors.success};
  display: flex;
  flex: 1;
  justify-content: flex-end;
  padding-right: 10px;
  width: 20px;
`;

const BadgeIcon = styled(AttentionIcon)`
  font-size: 16px;
  & > span {
    background: rgba(${p => p.isSelected ? '40, 40, 40' : p.theme.colors.darkMainRGB}, 0.6);
    margin: 0
  };
`;

const Tab = styled.div`
  align-items: center;
  background: black;
  border-radius: 8px 0 0 8px;
  border-right: 3px solid transparent;
  opacity: 0.5;
  display: flex;
  flex-direction: row;
  font-size: 17px;
  margin: 0 0 5px 20px;
  padding: 10px;
  text-transform: uppercase;
  transition:
    background 150ms ease,
    border-right-width 150ms ease,
    opacity 150ms ease;
  ${p => p.isSelected
    ? `
      background: rgba(${p.theme.colors.mainRGB}, 0.4);
      border-right-color: ${p.theme.colors.main};
      opacity: 1;
      ${NavIconWrapper} {
        opacity: 1;
      }
    `
    : `
      cursor: ${p.theme.cursors.active};
      &:hover {
        opacity: 0.9;
      }
  `};
`;

const CloseButton = styled(IconButton)`
  margin-right: 0;
  position: absolute !important;
  top: 17px;
  right: 20px;
  z-index: 2;
  ${p => p.hasBackground ? 'background: rgba(0, 0, 0, 0.75);' : ''}
`;

const BottomLeft = styled.div``;

const LauncherDialog = ({ panes = [], preselect, singlePane, bottomLeftMenu, paneOverflow }) => {
  const dispatchLauncherPage = useStore(s => s.dispatchLauncherPage);

  const [selected, setSelected] = useState();

  useEffect(() => {
    if (!!panes?.length) {
      setSelected(panes[preselect || 0]);
    }
  }, [!!panes?.length, preselect]);

  const handleClick = useCallback((pane) => {
    if (pane.link) {
      window.open(pane.link);
    } else {
      setSelected(pane);
    }
  }, []);

  const onClose = useCallback(() => {
    dispatchLauncherPage('play');
  }, []);

  return (
    <DialogWrapper id="DialogWrapper">
      <Padding>
        <Dialog>
          <CloseButton borderless hasBackground onClick={onClose}><CloseIcon /></CloseButton>
          {!singlePane && (
            <TabWrapper>
              {panes.map((pane) => {
                const isSelected = (selected?.key || selected?.label) === (pane.key || pane.label);
                return (
                  <Tab
                    key={pane.key || pane.label}
                    isSelected={isSelected}
                    onClick={() => handleClick(pane)}>
                    <NavIconWrapper><NavIcon color={theme.colors.main} /></NavIconWrapper>
                    <Label>
                      {pane.label}
                      {pane.sublabel && <Sublabel>{pane.sublabel}</Sublabel>}
                    </Label>
                    {pane.link && <LinkIcon />}
                    {pane.attention
                      ? <AttentionIcon><AttentionDot size={12} /></AttentionIcon>
                      : <BadgeIcon isSelected={isSelected}><Badge subtler value={pane.badge} /></BadgeIcon>
                    }
                  </Tab>
                );
              })}
              {bottomLeftMenu && (
                <>
                  <div style={{ flex: 1 }} />
                  <BottomLeft>
                    {bottomLeftMenu}
                  </BottomLeft>
                </>
              )}
            </TabWrapper>
          )}
          <PaneWrapper overflow={paneOverflow} singlePane={!!reactBool(singlePane)}>
            {singlePane || selected?.pane || null}
          </PaneWrapper>
          <ClipCorner dimension={30} color={borderColor} />
        </Dialog>
      </Padding>
    </DialogWrapper>
  );
};

export default LauncherDialog;
