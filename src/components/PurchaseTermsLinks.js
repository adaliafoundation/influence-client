import OnClickLink from '~/components/OnClickLink';

const stopPropagation = (event) => event.stopPropagation();

const TermsLink = ({ href, children }) => (
  <OnClickLink
    as="a"
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    onClick={stopPropagation}
    onKeyDown={stopPropagation}>
    {children}
  </OnClickLink>
);

const PurchaseTermsLinks = () => (
  <>
    <TermsLink href="https://influenceth.io/purchase-agreement">Purchase Agreement</TermsLink>
    {' and '}
    <TermsLink href="https://influenceth.io/terms">Terms of Service</TermsLink>
  </>
);

export default PurchaseTermsLinks;
