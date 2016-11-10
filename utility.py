import random

nums = [x for x in range(1, 11)]

def randomdigits():
	random.shuffle(nums)
	return nums[:3]