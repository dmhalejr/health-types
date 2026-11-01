import type { Element } from './Element';
import type { Extension } from './Extension';
import type { Period } from './Period';

/** Specifies an event that may occur multiple times. Timing schedules are used to record when things are planned, expected or requested to occur. The most common usage is in dosage instructions for medications. They are also used when planning care of various kinds, and may be used for reporting the schedule to which past regular activities were carried out. */
export interface Timing_Repeat {
  /** unique id for the element within a resource (for internal references). This may be any string value that does not contain spaces. */
  id?: string;

  /** Extensions for id */
  _id?: Element;

  /** May be used to represent additional information that is not part of the basic definition of the element. In order to make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. */
  extension?: Extension[];

  /** May be used to represent additional information that is not part of the basic definition of the element, and that modifies the understanding of the element that contains it. Usually modifier elements provide negation or qualification. In order to make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions. */
  modifierExtension?: Extension[];

  /** Either a duration for the length of the timing schedule, a range of possible length, or outer bounds for start and/or end limits of the timing schedule. */
  boundsPeriod?: Period;

  /** A total count of the desired number of repetitions. */
  count?: number;

  /** Extensions for count */
  _count?: Element;

  /** A maximum value for the count of the desired repetitions (e.g. do something 6-8 times). */
  countMax?: number;

  /** Extensions for countMax */
  _countMax?: Element;

  /** How long this thing happens for when it happens. */
  duration?: number;

  /** Extensions for duration */
  _duration?: Element;

  /** The upper limit of how long this thing happens for when it happens. */
  durationMax?: number;

  /** Extensions for durationMax */
  _durationMax?: Element;

  /** The units of time for the duration, in UCUM units. */
  durationUnit?: 's' | 'min' | 'h' | 'd' | 'wk' | 'mo' | 'a';

  /** Extensions for durationUnit */
  _durationUnit?: Element;

  /** The number of times to repeat the action within the specified period / period range (i.e. both period and periodMax provided). */
  frequency?: number;

  /** Extensions for frequency */
  _frequency?: Element;

  /** If present, indicates that the frequency is a range - so to repeat between [frequency] and [frequencyMax] times within the period or period range. */
  frequencyMax?: number;

  /** Extensions for frequencyMax */
  _frequencyMax?: Element;

  /** Indicates the duration of time over which repetitions are to occur; e.g. to express "3 times per day", 3 would be the frequency and "1 day" would be the period. */
  period?: number;

  /** Extensions for period */
  _period?: Element;

  /** If present, indicates that the period is a range from [period] to [periodMax], allowing expressing concepts such as "do this once every 3-5 days. */
  periodMax?: number;

  /** Extensions for periodMax */
  _periodMax?: Element;

  /** The units of time for the period in UCUM units. */
  periodUnit?: 's' | 'min' | 'h' | 'd' | 'wk' | 'mo' | 'a';

  /** Extensions for periodUnit */
  _periodUnit?: Element;

  /** If one or more days of week is provided, then the action happens only on the specified day(s). */
  dayOfWeek?: string[];

  /** Extensions for dayOfWeek */
  _dayOfWeek?: (Element | null)[];

  /** Specified time of day for action to take place. */
  timeOfDay?: string[];

  /** Extensions for timeOfDay */
  _timeOfDay?: (Element | null)[];

  /** Real world events that the occurrence of the event should be tied to. */
  when?: (
    | 'MORN'
    | 'AFT'
    | 'EVE'
    | 'NIGHT'
    | 'PHS'
    | 'HS'
    | 'WAKE'
    | 'C'
    | 'CM'
    | 'CD'
    | 'CV'
    | 'AC'
    | 'ACM'
    | 'ACD'
    | 'ACV'
    | 'PC'
    | 'PCM'
    | 'PCD'
    | 'PCV'
  )[];

  /** Extensions for when */
  _when?: (Element | null)[];

  /** The number of minutes from the event. If the event code does not indicate whether the minutes is before or after the event, then the offset is assumed to be after the event. */
  offset?: number;

  /** Extensions for offset */
  _offset?: Element;
}
