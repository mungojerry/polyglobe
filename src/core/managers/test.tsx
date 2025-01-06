import { GroupType, useGetGroup, useGroupType } from '@MyApp-app/api-controller';
import AppBackgroundSVG from '@MyApp-app/assets/svg/AppBackgroundSVG';
import { MyAppPillButton, MyAppText } from '@MyApp-app/controls';
import { GroupPlanUserStatus, Groupuser } from '@MyApp-app/core';
import { en } from '@MyApp-app/language';
import { TailwindStyle, tw, userColors } from '@MyApp-app/styles';
import {
    useGetuserStatusTextCallback,
    useOnSelectGroupuser,
    useusersList,
} from '@MyApp-app/ui-logic';
import {
    formatPhoneNumberWithSpaces,
    useGreetingMessage,
} from '@MyApp-app/util-generic';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, FlatList, View } from 'react-native';

import { useReloadAsGroupuser } from '../../common/hook/groupLoadingHooks';
import { AnimatedDots } from './animatedDots';
import { GroupusersMiniCarousel } from './miniCaroiusel';

export type MyAppuserSelectorProps = {
  testID?: string;

  showWelcome?: boolean;
  style?: TailwindStyle;
  onChangeSelectedIndex?: (index: number) => void;
};

export const MyAppuserSelector = React.forwardRef(
  (
    props: MyAppuserSelectorProps,
    ref: React.ForwardedRef<View>,
  ): JSX.Element => {
    const [userIndex, setuserIndex] = useState(0);
    const {data: group} = useGetGroup();
    const groupType = useGroupType();
    const usersList = useusersList();
    const flatListRef = useRef(null);
    const {onChangeSelectedIndex, showWelcome = true} = props;
    const [page, setPage] = useState(0);
    const getStatusText = useGetuserStatusTextCallback();
    const greetingMessage = useGreetingMessage();
    const {width: SCREEN_WIDTH} = Dimensions.get('window');

    const onResetCallback = useCallback(() => {
      setuserIndex(-1);
      if (group?.owner?.id !== undefined) {
        const ownerIndex = usersList.findIndex(
          (user) => user.id === group?.owner?.id,
        );
        setuserIndex(ownerIndex);
      } else {
        setuserIndex(0);
      }
    }, [group?.owner?.id, usersList, setuserIndex]);

    const reloadAsGroupuser = useReloadAsGroupuser();

    const onCompleteGroupuserSelection = useCallback(
      (selecteduserIndex?: number) => {
        if (
          groupType === GroupType.GroupPlan &&
          selecteduserIndex !== undefined
        ) {
          setuserIndex(selecteduserIndex);
        } else {
          reloadAsGroupuser();
        }
      },
      [groupType, reloadAsGroupuser, setuserIndex],
    );

    const onSelectGroupuser = useOnSelectGroupuser(
      usersList,
      onResetCallback,
      onCompleteGroupuserSelection,
    );

    const selectuser = useCallback(
      (index: number) => {
        setuserIndex((prevSelected) => {
          if (index !== prevSelected) {
            onSelectGroupuser(index, prevSelected);
            return index;
          }
          return prevSelected;
        });
      },
      [setuserIndex, onSelectGroupuser],
    );

    /**
     * Renders individual page
     * @param root0 - root options passed to renderPage
     * @param root0.item - GroupPlanUser
     * @param root0.index - number
     * @returns JSX.Element
     */
    const renderPage = ({item, index}: {item: Groupuser; index: number}) => {
      const userState = getStatusText(item.status);

      return (
        <View key={'page' + index} style={{width: SCREEN_WIDTH}}>
          {showWelcome && item.owner && (
            <View style={tw`items-center`}>
              <MyAppText>{greetingMessage}</MyAppText>
            </View>
          )}

          <View style={tw`items-center justify-start gap-y-1`}>
            <View style={tw`items-center`}>
              <MyAppText
                style={tw`MyApp-text-4xl font-theme-bold text-${userColors[index].main}`}>
                {item.firstName && item.firstName !== ''
                  ? item.firstName
                  : item.lastName}
              </MyAppText>
            </View>
            {item.msisdn && (
              <MyAppText>
                {'+' + formatPhoneNumberWithSpaces(item.msisdn)}
              </MyAppText>
            )}
            {item.owner &&
            item.status !== GroupPlanUserStatus.AwaitingActivation ? (
              <MyAppPillButton style={tw`MyApp-text-sm py-0`}>
                {en.groupOwnerLabel}
              </MyAppPillButton>
            ) : (
              userState !== '' && (
                <MyAppPillButton style={tw`MyApp-text-sm py-0`}>
                  {userState}
                </MyAppPillButton>
              )
            )}
          </View>
        </View>
      );
    };

    const userIndexRef = useRef(userIndex);
    useEffect(() => {
      userIndexRef.current = userIndex;
    }, [userIndex]);

    const VIEWABILITY_CONFIG = {
      itemVisiblePercentThreshold: 70,
    };

    const getItemLayout = (_: any, index: number) => ({
      length: SCREEN_WIDTH,
      offset: SCREEN_WIDTH * index,
      index,
    });

    const handleViewableItemsChange = ({ viewableItems }: any) => {
      if (viewableItems.length > 0) {
        const index = viewableItems[0].index || 0;
        if (index !== userIndexRef.current) {
          selectuser(index);
          setPage(index);
          onChangeSelectedIndex && onChangeSelectedIndex(index);
        }
      }
    };

    return (
      <View ref={ref} style={tw`flex`}>
        <AppBackgroundSVG style={tw`absolute`} width="100%" height="100%" />

        <View style={tw`flex-row justify-end gap-3 MyApp-mx-5 pt-4`}>
          <GroupusersMiniCarousel selected={page} />
        </View>
        <FlatList
          ref={flatListRef}
          data={usersList}
          renderItem={renderPage}
          horizontal
          pagingEnabled
          style={tw`pt-4`}
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={handleViewableItemsChange}
          viewabilityConfig={VIEWABILITY_CONFIG}
          initialScrollIndex={0}
          getItemLayout={getItemLayout}
        />
        <View style={tw`flex-1 items-center justify-center flex-row`}>
          <AnimatedDots data={usersList} page={page} colors={userColors} />
        </View>
      </View>
    );
  },
);
