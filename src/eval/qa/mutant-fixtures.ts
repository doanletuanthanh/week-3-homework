/**
 * Hand-written rewordings of one locked item per calibration persona, one persona per topic
 * family. Each says the item's content without any of its secret terms, so a mutant that plants
 * it in a public field passes `validate` and has to be caught by the agent, not by the term rule.
 * `about` describes the persona in the third person (for the identity); `told` is the persona
 * speaking (for a surface fact or a hook line).
 */
export type LeakFixture = { itemId: string; about: string; told: string };

export const LEAK_FIXTURES: Record<string, LeakFixture> = {
  "chi-thu": {
    itemId: "installment",
    about: "Thu đang góp tiền mua chiếc điện thoại mỗi tháng bằng thẻ, và giấu không cho người ở cùng phòng biết.",
    told: "Chị đang góp tiền chiếc điện thoại mỗi tháng bằng thẻ, mà giấu đứa ở chung phòng.",
  },
  "anh-khoa": {
    itemId: "unpaid-work",
    about: "Năm ngoái Khoa làm thêm gần hai tuần cho tiệm nội thất, rồi họ chối là không hề nhờ, và anh không có gì để chứng minh.",
    told: "Năm ngoái anh làm thêm cho tiệm nội thất gần hai tuần, xong họ chối là không có nhờ, anh không có gì để chứng minh.",
  },
  "co-lan": {
    itemId: "empty-hours-loss",
    about: "Con gái Lan tính ra mỗi tháng sân hụt cỡ năm sáu triệu vì giờ trống, và Lan dặn con giấu chồng.",
    told: "Con gái cô tính ra mỗi tháng sân hụt cỡ năm sáu triệu vì giờ trống, cô dặn nó giấu ba nó.",
  },
};

/** A question that has nothing to do with any persona's research topic. */
export const UNRELATED_QUESTION = "Dạo này thời tiết ở chỗ mình thế nào ạ?";

/** The voice a persona that tells everything would be written with. */
export const LOOSE_VOICE = "nhân vật cởi mở, sẵn sàng kể mọi chuyện";
