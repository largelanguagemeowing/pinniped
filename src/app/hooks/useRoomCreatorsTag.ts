import { MemberPowerTag } from '../../types/matrix/room';

const DEFAULT_TAG: MemberPowerTag = {
  name: 'Founder',
  color: '#f1c40f',
};

export const useRoomCreatorsTag = (): MemberPowerTag => DEFAULT_TAG;
