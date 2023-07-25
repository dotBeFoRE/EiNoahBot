import {
  Entity, ManyToOne, OneToMany, Collection, PrimaryKey, Unique, OneToOne, BaseEntity, Property,
} from '@mikro-orm/core';
// eslint-disable-next-line import/no-cycle
import { User } from './User';
// eslint-disable-next-line import/no-cycle
import { Guild } from './Guild';
// eslint-disable-next-line import/no-cycle
import Quote from './Quote';
// eslint-disable-next-line import/no-cycle
import TempChannel from './TempChannel';
// eslint-disable-next-line import/no-cycle
import LobbyNameChange from './LobbyNameChange';

@Entity()
@Unique({ properties: ['guild', 'user'] })
// eslint-disable-next-line import/prefer-default-export
export class GuildUser extends BaseEntity<GuildUser, 'id'> {
  @PrimaryKey()
    id!: number;

  @ManyToOne({ entity: 'Guild' })
    guild!: Guild;

  @ManyToOne({ entity: 'User' })
    user!: User;

  @OneToOne({
    entity: 'TempChannel', mappedBy: 'guildUser',
  })
    tempChannel?: TempChannel;

  @OneToMany({ entity: () => Quote, mappedBy: 'guildUser' })
    quotes = new Collection<Quote>(this);

  @OneToMany({ entity: () => Quote, mappedBy: 'creator' })
    createdQuotes = new Collection<Quote>(this);

  @Property({ length: 20 })
    birthdayMsg?: string;

  @OneToMany(() => LobbyNameChange, (lnc) => lnc.guildUser)
    lobbyNameChanges = new Collection<LobbyNameChange>(this);
}