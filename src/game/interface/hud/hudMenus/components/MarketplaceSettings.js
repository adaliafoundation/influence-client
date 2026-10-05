import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Exchange, Product } from '@influenceth/sdk';
import { PuffLoader as Loader } from 'react-spinners';

import UncontrolledTextInput, { TextInputWrapper } from '~/components/TextInputUncontrolled';
import useMarketplaceAdmin from '~/hooks/actionManagers/useMarketplaceAdmin';
import Button from '~/components/ButtonAlt';
import { StaticAutocomplete } from '~/components/Autocomplete';
import IconButton from '~/components/IconButton';
import { CloseIcon } from '~/components/Icons';
import { nativeBool } from '~/lib/utils';

const Section = styled.div`
  border-bottom: 1px solid #333;
  margin-bottom: 10px;
  padding-bottom: 10px;
`;
const InputBlock = styled.div`
  font-size: 15px;
  padding-bottom: 12px;
  padding-right: 2px;
  &:last-child {
    padding-bottom: 0;
  }

  label {
    align-items: flex-end;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
  }

  & > div {
    align-items: flex-end;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    padding-top: 4px;
    width: 100%;

    & > span {
      opacity: 0.5;
      padding-left: 8px;
    }
  }
`;
const HoverContent = styled.div`
  display: none;
`;
const NoHoverContent = styled.div`
  display: block;
  font-size: 13.3333px;
  padding-left: 6px;
  color: ${p => p.highlight ? p.theme.colors.green : p.theme.colors.main};
`;
const ProductRow = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  height: 32px;
  margin-bottom: 2px;

  & > span {
    opacity: 0.5;
    text-align: center;
    width: 16px;
  }

  & > div {
    width: 250px;
  }

  ${p => p.focused ? '' : '&:hover {'};
    ${HoverContent} {
      display: block;
    }
    ${NoHoverContent} {
      display: none;
    }
  ${p => p.focused ? '' : '}'};
`;

const MarketplaceSettings = ({ marketplace }) => {
  const { changeSettings, changingSettings } = useMarketplaceAdmin(marketplace?.id);
  const { Exchange: exchange } = marketplace;

  const [ loading, setLoading ] = useState();
  const [ focused, setFocused ] = useState();
  const [ products, setProducts ] = useState(exchange.allowedProducts || []);
  const [ makerFee, setMakerFee ] = useState(exchange.makerFee / 100);
  const [ takerFee, setTakerFee ] = useState(exchange.takerFee / 100);

  const handleChange = useCallback((setter, defaultValue) => (e) => {
    setter(
      Math.max(
        e.currentTarget.min,
        Math.min(
          parseFloat((((e.currentTarget.value || defaultValue) / e.currentTarget.step) * e.currentTarget.step).toFixed(3)),
          e.currentTarget.max
        )
      )
    );
  }, []);

  const handleRevert = useCallback(() => {
    setProducts(exchange.allowedProducts || []);
    setMakerFee(exchange.makerFee / 100);
    setTakerFee(exchange.takerFee / 100);
    setFocused();
  }, [exchange]);

  // revert if exchange is updated (handleRevert will be changed)
  // (these are intended to maintain a "loading" state until the updated exchange has been fetched)
  useEffect(() => {
    if (changingSettings) setLoading(true);
  }, [changingSettings]);
  useEffect(() => {
    setLoading(false);
  }, [handleRevert]);

  const handleBlur = useCallback((index) => (e) => {
    setFocused();
  }, []);

  const handleFocus = useCallback((index) => (e) => {
    setFocused(index);
  }, []);

  const saveChanges = useCallback(() => {
    setFocused();
    return changeSettings({
      makerFee: makerFee * 100,
      takerFee: takerFee * 100,
      allowedProducts: products,
    });
  }, [makerFee, takerFee, products, changeSettings]);

  const updateProductList = useCallback((index, value) => {
    let s = new Set();

    // create a set of the remaining products + this one
    // (removing the current product at index)
    products.forEach((p, x) => { if (x !== index) s.add(p); });
    if (value) s.add(value);

    // sort them and set them
    const final = Array.from(s).sort((a, b) => Product.TYPES[a].name < Product.TYPES[b].name ? -1 : 1);
    setProducts(final);
  }, [products]);

  const [productList, productListLength] = useMemo(() => {
    const l = [];
    let len = 0;
    for (let i = 0; i < Exchange.TYPES[exchange.exchangeType].productCap; i++) {
      len += products[i] ? 1 : 0;
      l.push(products[i] || null);
    }
    return [l, len];
  }, [exchange.exchangeType, products]);

  const isDirty = useMemo(() => (
    makerFee !== exchange.makerFee / 100
    || takerFee !== exchange.takerFee / 100
    || products.length !== exchange.allowedProducts.length
    || products.some((i, index) => i !== exchange.allowedProducts[index])
  ), [exchange, makerFee, takerFee, products, productListLength]);

  if (loading) {
    return (
      <div style={{ alignItems: 'center', display: 'flex', height: 100, justifyContent: 'center' }}>
        <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'center', height: 50, width: 50 }}><Loader color="white" size={30} /></div>
        <div style={{ opacity: 0.5 }}>Saving Changes...</div>
      </div>
    )
  }
  return (
    <>
      <Section>
        <InputBlock singleField>
          <label>Maker Fee</label>
          <div>
            <TextInputWrapper rightLabel="%">
              <UncontrolledTextInput
                max={25}
                min={0}
                onBlur={handleChange(setMakerFee, makerFee || 0)}
                onChange={handleChange(setMakerFee)}
                step={0.001}
                type="number"
                value={makerFee}
                width={72} />
            </TextInputWrapper>
            <span>Min 0.0% | Max 25%</span>
          </div>
        </InputBlock>
      </Section>

      <Section>
        <InputBlock singleField>
          <label>Taker Fee</label>
          <div>
            <TextInputWrapper rightLabel="%">
              <UncontrolledTextInput
                max={25}
                min={0}
                onBlur={handleChange(setTakerFee, takerFee || 0)}
                onChange={handleChange(setTakerFee)}
                step={0.001}
                type="number"
                value={takerFee}
                width={72} />
            </TextInputWrapper>
            <span>Min 0.0% | Max 25%</span>
          </div>
        </InputBlock>
      </Section>

      <Section>
        <InputBlock>
          <label>
            <div>Listed Products</div>
            <span>{productListLength} / {Exchange.TYPES[exchange.exchangeType].productCap}</span>
          </label>
          <div>
            <div style={{ marginTop: 6 }}>
              {productList.map((i, index) => (
                <ProductRow key={i || `index_${index}`} focused={focused === index}>
                  <span>{index + 1}</span>
                  <div>
                    <HoverContent>
                      <StaticAutocomplete
                        labelKey="name"
                        footnoteKey="category"
                        onFocus={handleFocus(index)}
                        onBlur={handleBlur(index)}
                        onSelect={(value) => {
                          handleBlur(index);
                          updateProductList(index, value?.i);
                        }}
                        options={Object.values(Product.TYPES)}
                        placeholder={focused === index ? 'Type to search...' : 'Add Product'}
                        selected={Product.TYPES[i]}
                        valueKey="i"
                        width={250}
                      />
                    </HoverContent>
                    <NoHoverContent highlight={!i}>
                      {i ? Product.TYPES[i]?.name : 'Add Product'}
                    </NoHoverContent>
                  </div>
                  {i && (
                    <IconButton
                      onClick={() => updateProductList(index, null)}
                      borderless>
                      <CloseIcon />
                    </IconButton>
                  )}
                </ProductRow>
              ))}
            </div>
          </div>
        </InputBlock>
      </Section>

      <div style={{ display: 'flex' }}>
        {isDirty && (
          <Button
            onClick={handleRevert}
            width={125}>
            <CloseIcon />
            Revert
          </Button>
        )}
        <div style={{ flex: 1 }} />
        <Button
          disabled={nativeBool(!isDirty)}
          isTransaction
          onClick={saveChanges}
          width={125}>
          Update
        </Button>
      </div>
    </>
  );
};

export default MarketplaceSettings;