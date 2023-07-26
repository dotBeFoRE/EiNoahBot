import { Migration } from '@mikro-orm/migrations';

export class Migration20230725121532 extends Migration {
  async up(): Promise<void> {
    this.addSql('drop table if exists "user_corona_regions" cascade;');

    this.addSql('drop table if exists "corona_data" cascade;');

    this.addSql('alter table "user" alter column "count" type int using ("count"::int);');
    this.addSql('alter table "user" alter column "count" set default 0;');
  }

  async down(): Promise<void> {
    this.addSql('create table "user_corona_regions" ("id" serial primary key, "user_id" varchar(255) not null, "region" varchar(255) not null);');
    this.addSql('alter table "user_corona_regions" add constraint "user_corona_regions_user_id_region_unique" unique ("user_id", "region");');

    this.addSql('create table "corona_data" ("id" serial primary key, "date" timestamptz(0) not null, "community" varchar(255) not null, "total_reported" int not null, "deceased" int not null);');
    this.addSql('alter table "corona_data" add constraint "corona_data_date_community_unique" unique ("date", "community");');

    this.addSql('alter table "user_corona_regions" add constraint "user_corona_regions_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade;');

    this.addSql('alter table "user" alter column "count" drop default;');
    this.addSql('alter table "user" alter column "count" type int using ("count"::int);');
  }
}
