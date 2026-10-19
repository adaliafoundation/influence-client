import { useState } from 'react';
import ConfirmationDialog from './ConfirmationDialog';
import AcknowledgementCheckbox from './AcknowledgementCheckbox';
import WarningAlert from './WarningAlert';
import { WarningIcon } from './Icons';

const names = (crews) => crews.map((crew) => crew.Name?.name || `Crew #${crew.id}`).join(', ');

const CrewExchangeConfirmation = ({ warnings, onConfirm, onReject }) => {
  const [acknowledged, setAcknowledged] = useState(false);
  const losesBenefits = warnings.benefits.length > 0;
  return (
    <ConfirmationDialog
      title="Confirm Crewmate Exchange"
      disabled={losesBenefits && !acknowledged}
      onConfirm={() => { if (!losesBenefits || acknowledged) onConfirm(); }}
      onReject={onReject}
      body={(
        <>
          {warnings.missions.length > 0 && <WarningAlert severity="warning" role="alert">
            <div><WarningIcon /></div>
            <div>
              <strong>Starter mission campaign</strong>
              <p>This exchange permanently ends starter mission eligibility for {names(warnings.missions)}.
                Further campaign progress will be unavailable. Rewards for missions already recorded as completed remain claimable.</p>
            </div>
          </WarningAlert>}
          {losesBenefits && <WarningAlert severity="warning" role="alert">
              <div><WarningIcon /></div>
              <div>
                <strong>Unused starter pack benefits</strong>
                <p>This exchange permanently forfeits all remaining starter pack benefits for {names(warnings.benefits)},
                  including unused building, lot lease, food reload, and core sample allowances.
                  Moving crewmates back will not restore these benefits.</p>
                <AcknowledgementCheckbox checked={acknowledged} onChange={setAcknowledged}>
                  <span>I understand that these unused starter pack benefits will be permanently lost.</span>
                </AcknowledgementCheckbox>
              </div>
            </WarningAlert>}
        </>
      )}
    />
  );
};

export default CrewExchangeConfirmation;
